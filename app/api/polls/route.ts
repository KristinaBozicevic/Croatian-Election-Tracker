import { pollRefreshResponse } from "../../poll-refresh";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return pollRefreshResponse(request);
}
