require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Serve the frontend from the "public" folder
app.use(express.static(path.join(__dirname, "public")));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY in .env file.");
  process.exit(1);
}

const SYSTEM_PROMPT = `
You are GovEase, an AI assistant that helps Indian citizens find government schemes they are eligible for.

When a user describes their situation (in English, Hindi, or Assamese), you MUST respond ONLY in the following JSON format.
Do NOT include any text, explanation, markdown, or backticks outside the JSON.

{
  "schemes": [
    {
      "name": "Scheme Name",
      "ministry": "Ministry or Department Name",
      "benefit": "Specific benefit — amount, subsidy, or service provided",
      "eligibility": "One sentence explaining why THIS user qualifies based on their description",
      "documents": ["Document 1", "Document 2", "Document 3"],
      "applyAt": "Official website URL or office name",
      "tag": "Farmer | Student | Women | Health | Housing | Business | Banking"
    }
  ],
  "summary": "One friendly sentence summarising what you found for them"
}

Rules:
- Return 3 to 6 of the MOST relevant schemes only.
- Base eligibility strictly on what the user described.
- If the user mentions Assam, also include Assam-specific state schemes.
- If the user writes in Hindi or Assamese, still return JSON (the summary can be in their language).
- Always pick exactly one tag per scheme from: Farmer, Student, Women, Health, Housing, Business, Banking.
- Only return the JSON object. No extra text outside it.

Scheme knowledge base:
Central Schemes:
- PM Kisan Samman Nidhi — Rs.6,000/year for small and marginal farmers
- PM Ujjwala Yojana — Free LPG connection for BPL women
- PM Awas Yojana (Gramin and Urban) — Housing subsidy for homeless/kutcha house families
- Ayushman Bharat PM-JAY — Rs.5 lakh/year health cover for BPL families
- National Scholarship Portal (NSP) — Pre/Post Matric scholarships for SC/ST/OBC/Minority students
- PM Mudra Yojana — Collateral-free loans Rs.50k to Rs.10L for small businesses
- Sukanya Samriddhi Yojana — High-interest savings for girl child education and marriage
- PM Jan Dhan Yojana — Zero balance bank account with RuPay card and Rs.2L accident cover
- Beti Bachao Beti Padhao — Welfare of girl child
- PM Kaushal Vikas Yojana (PMKVY) — Free skill training and certification
- Atal Pension Yojana — Pension for unorganised sector workers
- PM Fasal Bima Yojana — Crop insurance for farmers
- Stand Up India — Rs.10L to Rs.1Cr loans for SC/ST/Women entrepreneurs
- PM SVANidhi — Loans for street vendors
- NREGA/MGNREGS — 100 days guaranteed wage employment
- Antyodaya Anna Yojana — 35 kg ration/month for poorest families
- PM Garib Kalyan Anna Yojana — Free 5 kg grain/month

Assam-Specific Schemes:
- Orunodoi Scheme — Rs.1,250/month cash transfer to BPL women (Assam)
- Arundhati Gold Scheme — 1 tola gold for brides at marriage (Assam)
- Mukhyamantri Krishi Sa-Sajuli Yojana — Free farm tools for small farmers (Assam)
- Assam Adarsha Vidyalaya — Quality schooling for rural students (Assam)
`;

app.post("/api/schemes", async (req, res) => {
  const { userDescription } = req.body;

  if (!userDescription || userDescription.trim() === "") {
    return res.status(400).json({ error: "Please describe your situation." });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: [
            {
              parts: [{ text: userDescription.trim() }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192,
          },
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini error:", data);
      if (data?.error?.code === 429) {
        return res.status(429).json({
          error: "API quota exceeded. Please wait a few seconds and try again.",
        });
      }
      return res
        .status(502)
        .json({ error: "Gemini API error: " + data?.error?.message });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return res
        .status(500)
        .json({ error: "No response received from Gemini." });
    }

    const cleaned = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr.message);
      console.error("Raw output:", rawText);
      return res
        .status(500)
        .json({ error: "Could not parse AI response. Please try again." });
    }

    return res.json(parsed);
  } catch (err) {
    console.error("Server error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GovEase running at http://localhost:${PORT}`);
});
