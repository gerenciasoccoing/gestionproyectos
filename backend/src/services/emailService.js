// Envío de correos transaccionales (recuperación de contraseña, registro de empresas) vía Resend
// (https://resend.com/docs/api-reference/emails/send-email). Mismo criterio que whatsappService.js:
// credenciales por variable de entorno, nunca en la base de datos; si RESEND_API_KEY no está
// configurada, no lanza — solo deja el correo en el log del servidor (modo desarrollo/sandbox), así
// el resto del flujo (tokens, registros en base de datos) se puede seguir probando sin cuenta real.
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'ERGY-PROJECT <onboarding@resend.dev>';

async function sendEmail({ to, subject, html, text }) {
  if (!RESEND_API_KEY) {
    console.log(`[emailService] RESEND_API_KEY no configurada — correo NO enviado, solo registrado:\n  Para: ${to}\n  Asunto: ${subject}\n  Texto: ${text || html}`);
    return { ok: false, error: 'RESEND_API_KEY no configurada' };
  }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html, text }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error(`[emailService] Resend respondió ${resp.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
      return { ok: false, error: `Resend respondió con error ${resp.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('[emailService] No se pudo conectar con Resend:', err.message);
    return { ok: false, error: `No se pudo conectar con Resend: ${err.message}` };
  }
}

function wrapHtml(title, bodyHtml) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f6fb;padding:24px;margin:0;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #dfe3ee;">
      <p style="font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#2563eb;font-weight:600;margin:0 0 16px;">ERGY-PROJECT</p>
      <h1 style="font-size:20px;color:#0f1a2e;margin:0 0 16px;">${title}</h1>
      ${bodyHtml}
    </div>
  </body></html>`;
}

async function sendPasswordResetEmail({ to, name, resetUrl, isFirstAccess = false }) {
  const title = isFirstAccess ? '¡Bienvenido a ERGY-PROJECT!' : 'Restablece tu contraseña';
  const intro = isFirstAccess
    ? `Hola ${name}, tu empresa ya fue aprobada en ERGY-PROJECT. Define tu contraseña para empezar a usar la plataforma.`
    : `Hola ${name}, recibimos una solicitud para restablecer tu contraseña en ERGY-PROJECT.`;
  const cta = isFirstAccess ? 'Definir mi contraseña' : 'Restablecer contraseña';
  const html = wrapHtml(title, `
    <p style="color:#526082;font-size:14px;line-height:1.6;">${intro}</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${cta}</a>
    </p>
    <p style="color:#8792ab;font-size:12.5px;line-height:1.6;">Este enlace vence en 1 hora y solo se puede usar una vez. Si no fuiste tú, puedes ignorar este correo.</p>
  `);
  const text = `${intro}\n\n${cta}: ${resetUrl}\n\nEste enlace vence en 1 hora y solo se puede usar una vez.`;
  return sendEmail({ to, subject: isFirstAccess ? 'Bienvenido a ERGY-PROJECT — define tu contraseña' : 'Restablece tu contraseña en ERGY-PROJECT', html, text });
}

async function sendCompanyRequestNotification({ to, companyName, nit, contactName, contactEmail, phone, reviewUrl }) {
  const html = wrapHtml('Nueva solicitud de registro de empresa', `
    <p style="color:#526082;font-size:14px;line-height:1.6;">Una empresa solicitó registrarse en ERGY-PROJECT:</p>
    <table style="width:100%;font-size:14px;color:#0f1a2e;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:4px 0;color:#8792ab;">Empresa</td><td style="padding:4px 0;">${companyName}</td></tr>
      <tr><td style="padding:4px 0;color:#8792ab;">NIT</td><td style="padding:4px 0;">${nit || '-'}</td></tr>
      <tr><td style="padding:4px 0;color:#8792ab;">Contacto</td><td style="padding:4px 0;">${contactName}</td></tr>
      <tr><td style="padding:4px 0;color:#8792ab;">Correo</td><td style="padding:4px 0;">${contactEmail}</td></tr>
      <tr><td style="padding:4px 0;color:#8792ab;">Teléfono</td><td style="padding:4px 0;">${phone || '-'}</td></tr>
    </table>
    <p style="text-align:center;margin:28px 0;">
      <a href="${reviewUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Revisar solicitud</a>
    </p>
  `);
  const text = `Nueva solicitud de registro:\nEmpresa: ${companyName}\nNIT: ${nit || '-'}\nContacto: ${contactName} <${contactEmail}>\nTeléfono: ${phone || '-'}\n\nRevisar: ${reviewUrl}`;
  return sendEmail({ to, subject: `Nueva solicitud de registro: ${companyName}`, html, text });
}

async function sendCompanyRejectedEmail({ to, companyName, reason }) {
  const html = wrapHtml('Tu solicitud no fue aprobada', `
    <p style="color:#526082;font-size:14px;line-height:1.6;">
      Gracias por tu interés en ERGY-PROJECT. Revisamos la solicitud de registro de <strong>${companyName}</strong> y por ahora no fue aprobada.
      ${reason ? `<br><br>Motivo: ${reason}` : ''}
    </p>
    <p style="color:#8792ab;font-size:12.5px;line-height:1.6;">Si crees que esto es un error, puedes responder este correo o volver a intentarlo más adelante.</p>
  `);
  const text = `Gracias por tu interés en ERGY-PROJECT. La solicitud de registro de ${companyName} no fue aprobada.${reason ? `\nMotivo: ${reason}` : ''}`;
  return sendEmail({ to, subject: 'Tu solicitud de registro en ERGY-PROJECT', html, text });
}

module.exports = { sendEmail, sendPasswordResetEmail, sendCompanyRequestNotification, sendCompanyRejectedEmail };
