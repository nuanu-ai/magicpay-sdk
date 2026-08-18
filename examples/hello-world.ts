/**
 * The smallest runnable MagicPay program: check that an API key works.
 *
 *   MAGICPAY_API_KEY=<your key> npx tsx hello-world.ts
 *
 * `MAGICPAY_API_URL` is optional and defaults to the public API base URL. The
 * program prints the agent the key belongs to and exits 0, or exits 1 with a
 * readable message when the key is missing, rejected, or the API is
 * unreachable. Nothing here creates a session or spends money.
 */
import {
  getAuthenticatedAgent,
  getMagicPayErrorMessage,
  isMagicPayRequestErrorStatus,
} from '@nuanu-ai/magicpay-sdk';

const DEFAULT_API_URL = 'https://api.magicpay.nuanu.ai/functions/v1/api';

async function main(): Promise<number> {
  const apiKey = process.env.MAGICPAY_API_KEY;
  if (!apiKey) {
    console.error(
      'MAGICPAY_API_KEY is not set. Create an API key at app.magiccard.ai/signup, then export it.'
    );
    return 1;
  }

  const apiUrl = process.env.MAGICPAY_API_URL ?? DEFAULT_API_URL;

  try {
    const agent = await getAuthenticatedAgent({ apiKey, apiUrl });
    console.info(`Authenticated as "${agent.name}" (status: ${agent.status}).`);
    return 0;
  } catch (error) {
    // A wrong, revoked, or wrong-environment key is the failure worth naming:
    // the API answers 401 and the SDK raises MagicPayRequestError with that
    // status. Everything else is a transport or server problem.
    if (isMagicPayRequestErrorStatus(error, 401)) {
      console.error(
        `MAGICPAY_API_KEY was rejected by ${apiUrl}: ${getMagicPayErrorMessage(error) ?? 'HTTP 401'}`
      );
      return 1;
    }

    console.error(
      `Could not read the agent from ${apiUrl}: ${error instanceof Error ? error.message : String(error)}`
    );
    return 1;
  }
}

process.exitCode = await main();
