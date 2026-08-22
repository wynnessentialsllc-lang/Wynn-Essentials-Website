import { fallCampaignEmail, fallCampaigns } from "../../../../lib/fall-campaign-email";
import { runEmailCampaigns } from "../../../../lib/run-email-campaigns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runEmailCampaigns(request, fallCampaigns, fallCampaignEmail);
}
