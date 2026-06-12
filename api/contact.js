const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+()0-9\s-]{7,20}$/;

const MAX_NAME = 120;
const MAX_EMAIL = 160;
const MAX_PHONE = 30;
const MAX_DESCRIPTION = 4000;

const FETCH_TIMEOUT_MS = 10000;

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');
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

async function readJsonBody(req) {
    if (req.body && typeof req.body === 'object') {
        return req.body;
    }
    if (typeof req.body === 'string' && req.body.length > 0) {
        try {
            return JSON.parse(req.body);
        } catch (_) {
            return null;
        }
    }
    return await new Promise(resolve => {
        let raw = '';
        req.on('data', chunk => {
            raw += chunk;
            if (raw.length > 1_000_000) {
                req.destroy();
                resolve(null);
            }
        });
        req.on('end', () => {
            if (!raw) return resolve({});
            try {
                resolve(JSON.parse(raw));
            } catch (_) {
                resolve(null);
            }
        });
        req.on('error', () => resolve(null));
    });
}

async function sendWithResend({ apiKey, payload }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        const text = await response.text();
        return { ok: response.ok, status: response.status, body: text };
    } finally {
        clearTimeout(timer);
    }
}

module.exports = async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { RESEND_API_KEY, CONTACT_RECEIVER_EMAIL, CONTACT_FROM_EMAIL } = process.env;

    if (!isNonEmptyString(RESEND_API_KEY)) {
        console.error('[contact] Missing RESEND_API_KEY env var');
        return res.status(500).json({
            error: 'Formularz jest tymczasowo niedostępny. Skontaktuj się z nami pod adresem kontakt@vantamedia.pl.'
        });
    }

    const receiverEmail = isNonEmptyString(CONTACT_RECEIVER_EMAIL)
        ? CONTACT_RECEIVER_EMAIL.trim()
        : 'kontakt@vantamedia.pl';
    const fromEmail = isNonEmptyString(CONTACT_FROM_EMAIL)
        ? CONTACT_FROM_EMAIL.trim()
        : 'Vanta Media <kontakt@vantamedia.pl>';

    let body;
    try {
        body = await readJsonBody(req);
    } catch (error) {
        console.error('[contact] Failed to read body', error);
        return res.status(400).json({ error: 'Nie udało się odczytać danych formularza.' });
    }

    if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Nieprawidłowy format danych formularza.' });
    }

    if (isNonEmptyString(body.company)) {
        return res.status(200).json({ ok: true });
    }

    const name = isNonEmptyString(body.name) ? body.name.trim() : '';
    const email = isNonEmptyString(body.email) ? body.email.trim() : '';
    const phone = isNonEmptyString(body.phone) ? body.phone.trim() : '';
    const description = isNonEmptyString(body.description) ? body.description.trim() : '';
    const consent = body.consent === true || body.consent === 'true' || body.consent === 'on';

    if (!name || !email || !phone) {
        return res.status(400).json({ error: 'Uzupełnij wszystkie wymagane pola formularza.' });
    }

    if (name.length > MAX_NAME || email.length > MAX_EMAIL || phone.length > MAX_PHONE || description.length > MAX_DESCRIPTION) {
        return res.status(400).json({ error: 'Jedno z pól jest zbyt długie. Skróć treść i spróbuj ponownie.' });
    }

    if (!EMAIL_REGEX.test(email)) {
        return res.status(400).json({ error: 'Podaj poprawny adres e-mail.' });
    }

    if (!PHONE_REGEX.test(phone)) {
        return res.status(400).json({ error: 'Podaj poprawny numer telefonu (cyfry, spacje, +, -).' });
    }

    if (!consent) {
        return res.status(400).json({ error: 'Aby wysłać wiadomość, musisz zaakceptować politykę prywatności.' });
    }

    const payload = {
        from: fromEmail,
        to: [receiverEmail],
        reply_to: email,
        subject: `Nowe zapytanie z vantamedia.pl: ${name}`,
        text: [
            'Nowa wiadomość z formularza kontaktowego',
            '',
            `Imię i nazwisko: ${name}`,
            `E-mail: ${email}`,
            `Telefon: ${phone}`,
            '',
            'Opis projektu:',
            description || '-'
        ].join('\n'),
        html: buildHtmlBody({ name, email, phone, description })
    };

    let result;
    try {
        result = await sendWithResend({ apiKey: RESEND_API_KEY, payload });
    } catch (error) {
        const aborted = error && (error.name === 'AbortError' || error.code === 'ABORT_ERR');
        console.error('[contact] Resend request failed', error);
        return res.status(504).json({
            error: aborted
                ? 'Serwer pocztowy nie odpowiada. Spróbuj ponownie za chwilę.'
                : 'Nie udało się połączyć z serwerem pocztowym. Spróbuj ponownie za chwilę.'
        });
    }

    if (!result.ok) {
        console.error('[contact] Resend returned non-2xx', result.status, result.body);
        return res.status(502).json({
            error: 'Nie udało się wysłać wiadomości. Spróbuj ponownie za chwilę lub napisz na kontakt@vantamedia.pl.'
        });
    }

    return res.status(200).json({ ok: true });
};
