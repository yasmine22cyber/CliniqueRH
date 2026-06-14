const nodemailer = require("nodemailer");

// Gmail SMTP transporter (app password recommended).
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// Validate SMTP connection at startup.
transporter.verify((err) => {
  if (err) {
    console.error("SMTP verify error:", err);
  } else {
    console.log("SMTP ready");
  }
});

const sendResetEmail = async (to, link) => {
  try {
    const safeHref = String(link || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;");

    const info = await transporter.sendMail({
      from: `"Clinique RH" <${process.env.MAIL_USER}>`,
      to,
      subject: "Lien de reinitialisation de mot de passe",
      text:
        `Bonjour,\n\n` +
        `Copiez/collez ce lien pour reinitialiser votre mot de passe (valide 15 minutes):\n` +
        `${link}\n\n` +
        `Si vous n'etes pas a l'origine de cette demande, ignorez cet email.`,
      html: `
        <p>Bonjour,</p>
        <p>Cliquez sur le lien ci-dessous pour reinitialiser votre mot de passe (valide 15 minutes) :</p>
        <p><a href="${safeHref}" target="_blank" rel="noopener noreferrer">${link}</a></p>
        <p>Si vous n'etes pas a l'origine de cette demande, ignorez cet email.</p>
      `,
    });

    console.log("Mail sent:", info.messageId, "to", to);
    return info;
  } catch (err) {
    console.error("sendMail error:", err);
    throw err;
  }
};

const sendCredentialsEmail = async (to, matricule, password) => {
  if (!to || !matricule || !password) {
    throw new Error("Email, matricule ou mot de passe manquant pour l'envoi des identifiants.");
  }
  const subject = "Vos acces Clinique RH";
  const html = `
    <p>Bonjour,</p>
    <p>Votre compte a ete cree sur la plateforme Clinique RH.</p>
    <p><strong>Matricule :</strong> ${matricule}<br/>
       <strong>Mot de passe provisoire :</strong> ${password}</p>
    <p>Connectez-vous et changez votre mot de passe lors de votre premiere connexion.</p>
    <p>Ceci est un message automatique, merci de ne pas y repondre.</p>
  `;
  const info = await transporter.sendMail({
    from: `"Clinique RH" <${process.env.MAIL_USER}>`,
    to,
    subject,
    html,
  });
  console.log("Credentials mail sent:", info.messageId, "to", to);
  return info;
};

module.exports = { sendResetEmail, sendCredentialsEmail };