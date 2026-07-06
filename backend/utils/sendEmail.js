const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const sendEmail = async (to, subject, text) => {
  const info = await transporter.sendMail({
    from: '"TaskSync" <atharvapadwal24@gmail.com>',
    to,
    subject,
    text,
  });

  return info;
};

module.exports = sendEmail;