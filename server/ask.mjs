import ky from "ky";
const API = "http://localhost:8080";

const question = process.argv.slice(2).join(" ") || "Describe your risk management approach.";

const http = ky.create({ timeout: 120_000 });

const res = await http.post(`${API}/rfp/answer:suggest`, {
  json: { question }
}).json();

console.log(JSON.stringify(res, null, 2));
