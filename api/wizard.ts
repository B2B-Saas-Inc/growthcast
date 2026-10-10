import { handleWizard, type Req, type Res } from "../src/server/wizard/handler.js";

// Positioning Wizard API. vercel.json rewrites /api/wizard/<route> here with ?route=<route>.
export default function handler(req: Req, res: Res) {
  return handleWizard(req, res);
}
