import ky from "ky";

const base = "http://localhost:8080";

// 1) Ingest a sample Q&A
const ingestBody = {
  qa: {
    id: "11111111-1111-1111-1111-111111111111",
    question: "Describe our fixed-income investment philosophy",
    answer:
      "Our philosophy emphasizes rigorous credit research, risk-managed duration, and diversification across sectors to deliver consistent risk-adjusted returns."
  },
  chunks: [
    "Our philosophy emphasizes rigorous credit research, risk-managed duration, and diversification across sectors to deliver consistent risk-adjusted returns."
  ]
};

console.log("Ingesting...");
const ingestRes = await ky.post(`${base}/ingest/chunks`, { json: ingestBody }).json();
console.log("Ingest response:", ingestRes);

// 2) Ask for a suggested answer
console.log("Querying...");
const suggestRes = await ky
  .post(`${base}/rfp/answer:suggest`, {
    json: { question: "What is your fixed-income investment philosophy?" }
  })
  .json();

console.log("Suggest response:", suggestRes);
