const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildHtmlBody({ name, email, phone, description }) {
    return `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
            <h2 style="margin-bottom:12px;">Nowa wiadomość z formularza kontaktowego</h2>
            <p><strong>Imię i nazwisko:</strong> ${escapeHtml(name)}</p>
            <p><strong>E-mail:</strong> ${escapeHtml(email)}</p>
            <p><strong>Telefon:</strong> ${escapeHtml(phone)}</p>
            <p><strong>Opis projektu:</strong></p>
            <p style="white-space:pre-wrap;">${escapeHtml(description || '-')}</p>
        </div>
    `;
}

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { RESEND_API_KEY, CONTACT_RECEIVER_EMAIL, CONTACT_FROM_EMAIL } = process.env;

    if (!isNonEmptyString(RESEND_API_KEY)) {
        return res.status(500).json({ error: 'Missing RESEND_API_KEY environment variable' });
    }

    const receiverEmail = isNonEmptyString(CONTACT_RECEIVER_EMAIL)
        ? CONTACT_RECEIVER_EMAIL.trim()
        : 'kontakt@vantamedia.pl';
    const fromEmail = isNonEmptyString(CONTACT_FROM_EMAIL)
        ? CONTACT_FROM_EMAIL.trim()
        : 'Vanta Media <noreply@vantamedia.pl>';

    const { name, email, phone, description } = req.body || {};

    if (!isNonEmptyString(name) || !isNonEmptyString(email) || !isNonEmptyString(phone)) {
        return res.status(400).json({ error: 'Uzupełnij wymagane pola formularza.' });
    }

    const normalizedEmail = email.trim();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
        return res.status(400).json({ error: 'Podaj poprawny adres e-mail.' });
    }

    const payload = {
        from: fromEmail,
        to: [receiverEmail],
        reply_to: normalizedEmail,
        subject: `Nowe zapytanie: ${name.trim()}`,
        text: [
            'Nowa wiadomość z formularza kontaktowego',
            '',
            `Imię i nazwisko: ${name.trim()}`,
            `E-mail: ${normalizedEmail}`,
            `Telefon: ${phone.trim()}`,
            '',
            'Opis projektu:',
            isNonEmptyString(description) ? description.trim() : '-'
        ].join('\n'),
        html: buildHtmlBody({
            name: name.trim(),
            email: normalizedEmail,
            phone: phone.trim(),
            description: isNonEmptyString(description) ? description.trim() : ''
        })
    };

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        return res.status(502).json({
            error: 'Nie udało się wysłać wiadomości. Spróbuj ponownie za chwilę.',
            providerError: errorText
        });
    }

    return res.status(200).json({ ok: true });
}
