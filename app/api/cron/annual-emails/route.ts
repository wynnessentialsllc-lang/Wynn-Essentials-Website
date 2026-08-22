import { annualMarketingCampaigns } from "../../../../lib/annual-marketing-campaigns";
import { annualMarketingEmail } from "../../../../lib/annual-marketing-email";
import { runEmailCampaigns } from "../../../../lib/run-email-campaigns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  return runEmailCampaigns(request, annualMarketingCampaigns, annualMarketingEmail);
}
