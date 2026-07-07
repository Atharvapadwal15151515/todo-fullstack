const sendEmail = async (to, subject, text) => {
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: "TaskSync",
          email: "atharvapadwal24@gmail.com"
        },
        to: [
          {
            email: to
          }
        ],
        subject: subject,
        textContent: text
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("❌ Brevo API Error:", data);
      throw new Error(data.message || "Failed to send email");
    }

    console.log("✅ Email sent successfully");
    console.log(data);

    return data;

  } catch (error) {
    console.error("❌ sendEmail Error:", error);
    throw error;
  }
};

module.exports = sendEmail;