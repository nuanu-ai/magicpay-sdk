import {
  fillProtectedGroup,
  match,
  matchProtectedFillSubjects,
  observe,
  type MagicBrowseSemanticMatcherModel,
  type MagicBrowseMatchReadyGroupResult,
  type FillProtectedGroupInput,
} from '@mercuryo-ai/magicbrowse';
import {
  createMagicPayClient,
  type MagicPayGatewayConfig,
  type MagicPayRequestArtifact,
} from '@mercuryo-ai/magicpay-sdk';
import {
  buildObservedFormCandidateItems,
  buildObservedFormMatchCandidates,
  buildResolveInput,
  prepareProtectedFill,
  selectObservedFormCandidateItem,
} from '@mercuryo-ai/magicpay-sdk/magicbrowse';
import { fetchVaultCatalog } from '@mercuryo-ai/magicpay-sdk/core';

/**
 * End-to-end bridge example: observe -> match -> resolve -> fillProtectedGroup.
 *
 * MagicBrowse owns browser observation, matching, and the protected browser write.
 * MagicPay owns approval and the one-time values artifact. The SDK helpers in
 * `@mercuryo-ai/magicpay-sdk/magicbrowse` connect those two boundaries without
 * sending protected values through an LLM prompt.
 */
export interface MagicBrowseBridgeParams {
  gateway: MagicPayGatewayConfig;
  magicBrowseSessionId?: string;
  sessionId: string;
  pageUrl: string;
  merchantName: string;
  semanticMatcherModel: MagicBrowseSemanticMatcherModel;
  itemRef?: string;
}

function isValuesArtifact(
  artifact: MagicPayRequestArtifact
): artifact is Extract<MagicPayRequestArtifact, { kind: 'values' }> {
  return artifact.kind === 'values';
}

type ProtectedArtifactValues = Extract<
  Awaited<ReturnType<FillProtectedGroupInput['artifactReader']['read']>>,
  { status: 'resolved' }
>['values'];

function readProtectedArtifactValues(
  values: Record<string, unknown>
): ProtectedArtifactValues {
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  ) as ProtectedArtifactValues;
}

export async function completeObservedFormWithMagicPay(params: MagicBrowseBridgeParams) {
  const client = createMagicPayClient({ gateway: params.gateway });

  const observation = await observe({
    ...(params.magicBrowseSessionId ? { sessionId: params.magicBrowseSessionId } : {}),
  });
  const targetDescriptors = observation.orchestration?.fillableTargets?.descriptors ?? [];
  const observedForms = await matchProtectedFillSubjects({
    targets: targetDescriptors,
    model: params.semanticMatcherModel,
    page: { url: params.pageUrl },
  });
  const fillableForm =
    observedForms.find((candidate) => candidate.purpose === 'login') ?? observedForms[0] ?? null;
  if (!fillableForm) {
    throw new Error('No protected fill form was observed.');
  }

  const vaultCatalog = await fetchVaultCatalog(params.gateway, params.sessionId, params.pageUrl);
  const candidateItems = buildObservedFormCandidateItems(fillableForm, vaultCatalog);
  const selectedCandidate = selectObservedFormCandidateItem(candidateItems, params.itemRef);

  const matchCandidates = buildObservedFormMatchCandidates({
    fillableForm,
    merchantName: params.merchantName,
    selectedCandidate,
    ...(params.itemRef ? { explicitItemRef: params.itemRef } : {}),
  });
  const matched = await match(fillableForm, { from: matchCandidates });
  if (matched.kind !== 'needs_resolution_group') {
    throw new Error(`MagicBrowse did not produce a resolvable protected-fill plan: ${matched.kind}`);
  }

  const requestInput = buildResolveInput({
    clientRequestId: `${fillableForm.fillRef}-resolve`,
    merchantName: params.merchantName,
    fillableForm,
    ...(matched.plan.sourceRef ? { targetItemRef: matched.plan.sourceRef } : {}),
    urlOrHost: params.pageUrl,
    page: {
      url: params.pageUrl,
    },
  });
  if (!requestInput.success) {
    throw new Error(requestInput.reason);
  }

  const handle = await client.data.resolve(params.sessionId, requestInput.input);
  const result = await client.data.waitForResult(params.sessionId, handle, {
    intervalMs: 1_000,
  });
  if (!result.ok) {
    throw new Error(result.message ?? result.reason);
  }
  if (!isValuesArtifact(result.artifact)) {
    throw new Error(`MagicPay returned a ${result.artifact.kind} artifact; expected values.`);
  }

  const artifactRef = `magicpay-request:${result.requestId}`;
  const responseItemRef = result.itemRef ?? handle.itemRef ?? matched.plan.sourceRef;
  const readyMatch: MagicBrowseMatchReadyGroupResult = {
    kind: 'ready_group',
    fillRef: matched.fillRef,
    purpose: matched.purpose,
    candidateRef: matched.candidateRef,
    ...(responseItemRef ? { sourceRef: responseItemRef } : {}),
    fieldKeys: matched.fieldKeys,
    artifactRef,
    confidence: matched.confidence,
    ...(matched.fields ? { fields: matched.fields } : {}),
    ...(matched.fieldPolicies ? { fieldPolicies: matched.fieldPolicies } : {}),
  };
  const artifact = result.artifact as Extract<MagicPayRequestArtifact, { kind: 'values' }>;
  const protectedValues = readProtectedArtifactValues(artifact.values);
  const artifactReader: FillProtectedGroupInput['artifactReader'] = {
    async read(input) {
      if (input.artifactRef !== artifactRef) {
        return {
          status: 'blocked',
          reason: 'artifact_unavailable',
        };
      }

      return {
        status: 'resolved',
        values: protectedValues,
      };
    },
  };

  const prepared = prepareProtectedFill({
    fillableForm,
    catalog: requestInput.catalog,
    protectedValues,
    storedSecretRef: responseItemRef ?? null,
  });
  const fillResult = await fillProtectedGroup({
    ...(params.magicBrowseSessionId ? { sessionId: params.magicBrowseSessionId } : {}),
    subject: prepared.fillableForm,
    match: readyMatch,
    candidates: matchCandidates,
    artifactReader,
  });

  return {
    result: fillResult,
    selectedItemRef: selectedCandidate?.itemRef ?? null,
  };
}
