/** @format */

const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const xss = require("xss");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Set view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Configure email transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Configure rate limiter
const contactFormLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 3,
    message: "Too many inquiries submitted from this IP, please try again after 24 hours",
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        console.log(`Rate limit exceeded for IP: ${req.ip}`);
        return res.redirect("/?formError=true&message=rateLimit");
    },
});

// Routes
app.get("/", (req, res) => {
    const formSubmitted = req.query.formSubmitted === "true";
    const formError = req.query.formError === "true";
    const message = req.query.message;

    res.render("index", {
        title: "Digital Arts Technology Training Center Inc.",
        formSubmitted,
        formError,
        message,
    });
});

// Contact form submission handler
app.post("/submit-contact", contactFormLimiter, async (req, res) => {
    try {
        const {
            name: rawName,
            email: rawEmail,
            phone: rawPhone,
            program: rawProgram,
            message: rawMessage,
            "g-recaptcha-response": recaptchaToken
        } = req.body;

        // Sanitize all user inputs to prevent XSS attacks
        const name = xss(rawName);
        const email = xss(rawEmail);
        const phone = xss(rawPhone);
        const program = xss(rawProgram);
        const message = xss(rawMessage);

        console.log("Form submission received");

        // Verify reCAPTCHA
        if (!recaptchaToken) {
            console.error("No reCAPTCHA token provided");
            return res.redirect("/?formError=true");
        }

        console.log("reCAPTCHA token received:", recaptchaToken.substring(0, 10) + "...");

        // Verify with Google reCAPTCHA API
        const recaptchaVerifyUrl = "https://www.google.com/recaptcha/api/siteverify";
        console.log("Verifying with reCAPTCHA API...");

        const recaptchaResponse = await axios.post(recaptchaVerifyUrl, null, {
            params: {
                secret: process.env.RECAPTCHA_SECRET_KEY,
                response: recaptchaToken,
            },
        });

        console.log("reCAPTCHA API response:", recaptchaResponse.data);

        if (!recaptchaResponse.data.success) {
            console.error("reCAPTCHA verification failed:", recaptchaResponse.data["error-codes"]);
            return res.redirect("/?formError=true");
        }

        console.log("reCAPTCHA verification successful, sending emails...");

// Email content — internal notification
const mailOptions = {
    from: `"DATTCI Website" <${process.env.EMAIL_USER}>`,
    to: process.env.RECIPIENT_EMAIL,
    replyTo: email, // lets you hit "Reply" and respond directly to the inquirer
    subject: `Inquiry from ${name} — ${program || "General Inquiry"}`,
    html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <div style="background-color: #1a1a1a; padding: 16px 20px;">
                <h2 style="color: #ffffff; margin: 0; font-size: 18px;">New Website Inquiry</h2>
            </div>
            <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 6px 0; font-weight: bold; width: 140px; vertical-align: top;">Name</td>
                        <td style="padding: 6px 0;">${escapeHtml(name)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; font-weight: bold; vertical-align: top;">Email</td>
                        <td style="padding: 6px 0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; font-weight: bold; vertical-align: top;">Phone</td>
                        <td style="padding: 6px 0;">${escapeHtml(phone)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; font-weight: bold; vertical-align: top;">Program</td>
                        <td style="padding: 6px 0;">${escapeHtml(program || "Not specified")}</td>
                    </tr>
                </table>
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #eee;">
                    <p style="font-weight: bold; margin-bottom: 6px;">Message</p>
                    <p style="white-space: pre-line; margin: 0;">${escapeHtml(message)}</p>
                </div>
            </div>
            <div style="text-align: center; padding: 12px; font-size: 11px; color: #999;">
                <p>Submitted via digitalartstech.edu.ph contact form</p>
            </div>
        </div>
    `,
};

// Helper to prevent HTML injection from user input
function escapeHtml(str = "") {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Send confirmation email to the user
const confirmationEmail = {
    from: `"Digital Arts Technology Training Center Inc." <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Thank you for contacting Digital Arts Technology Training Center Inc.",
    html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 20px;">Digital Arts Technology Training Center Inc.</h1>
            </div>
            <div style="padding: 24px; border: 1px solid #eee; border-top: none;">
                <p>Dear ${escapeHtml(name)},</p>
                <p>Thank you for reaching out! We've received your inquiry about <strong>${escapeHtml(program || "our programs")}</strong> and will get back to you shortly.</p>

                <div style="background-color: #f7f7f7; border-radius: 6px; padding: 16px; margin: 20px 0;">
                    <h3 style="margin-top: 0; font-size: 15px; color: #555;">Your submitted details</h3>
                    <p style="margin: 6px 0;"><strong>Name:</strong> ${escapeHtml(name)}</p>
                    <p style="margin: 6px 0;"><strong>Email:</strong> ${escapeHtml(email)}</p>
                    <p style="margin: 6px 0;"><strong>Phone:</strong> ${escapeHtml(phone)}</p>
                    <p style="margin: 6px 0;"><strong>Program of Interest:</strong> ${escapeHtml(program || "Not specified")}</p>
                    <p style="margin: 6px 0;"><strong>Message:</strong><br>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
                </div>

                <p>If you have any urgent questions, feel free to reply directly to this email.</p>
                <p style="margin-top: 24px;">Best regards,<br><strong>The Digital Arts Technology Training Center Team</strong></p>
            </div>
            <div style="text-align: center; padding: 16px; font-size: 12px; color: #999;">
                <p>Digital Arts Technology Training Center Inc. &middot; Marikina City, Philippines</p>
            </div>
        </div>
    `,
};

        // Send both emails
        await transporter.sendMail(mailOptions);
        await transporter.sendMail(confirmationEmail);

        console.log("Form submitted and emails sent successfully");
        res.redirect("/?formSubmitted=true");
    } catch (error) {
        console.error("Error processing form submission:", error);
        res.redirect("/?formError=true");
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log(`Using reCAPTCHA site key: ${process.env.RECAPTCHA_SITE_KEY}`);
    console.log(`Using reCAPTCHA secret key: ${process.env.RECAPTCHA_SECRET_KEY.substring(0, 5)}...`);
});
