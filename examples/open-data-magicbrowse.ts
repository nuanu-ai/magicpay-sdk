import {
  createMagicPayClient,
  type MagicPayGatewayConfig,
} from '@mercuryo-ai/magicpay-sdk';
import {
  listObservedOpenDataEligibleTargetRefs,
  resolveObservedOpenDataTargets,
  type ObservedOpenDataEntry,
  type ObservedOpenDataSnapshot,
  type ProtectedFillForm,
  type ResolvedObservedOpenDataTarget,
  type TargetDescriptor,
} from '@mercuryo-ai/magicpay-sdk/magicbrowse';
import type { MagicBrowseSemanticMatcherModel } from '@mercuryo-ai/magicbrowse';

export interface OpenDataMagicBrowseParams {
  gateway: MagicPayGatewayConfig;
  targets: Record<string, TargetDescriptor>;
  pageUrl: string;
  semanticMatcherModel: MagicBrowseSemanticMatcherModel;
  protectedForms?: ReadonlyArray<Pick<ProtectedFillForm, 'fields'>>;
  targetRefs?: readonly string[];
  snapshot?: ObservedOpenDataSnapshot;
}

export interface OpenDataFillInstruction {
  targetRef: string;
  fieldKey: string;
  value: string | number;
  confidence: 'high' | 'medium';
  source: ObservedOpenDataEntry['source'];
}

function readOpenDataValue(value: unknown): string | number | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function addSnapshotEntry(
  snapshot: ObservedOpenDataSnapshot,
  fieldKey: string,
  value: string | number,
  source: ObservedOpenDataEntry['source'],
  host?: string
): void {
  const entry: ObservedOpenDataEntry = {
    fieldKey,
    value,
    source,
    applicability: host
      ? { target: 'host', value: host }
      : { target: 'global' },
  };
  (snapshot.valuesByField[fieldKey] ??= []).push(entry);
}

export function buildProfileFactsOpenDataSnapshot(
  facts: Record<string, unknown>,
  host?: string
): ObservedOpenDataSnapshot {
  const snapshot: ObservedOpenDataSnapshot = {
    valuesByField: {},
  };

  for (const [fieldKey, rawValue] of Object.entries(facts)) {
    const value = readOpenDataValue(rawValue);
    if (value === null) {
      continue;
    }

    addSnapshotEntry(snapshot, fieldKey, value, 'profile_facts', host);
  }

  return snapshot;
}

export function matchedOpenDataFillInstructions(
  results: readonly ResolvedObservedOpenDataTarget[],
  confidence: 'high' | 'medium' = 'high'
): OpenDataFillInstruction[] {
  const allowedConfidence =
    confidence === 'high' ? new Set(['high']) : new Set(['high', 'medium']);

  return results
    .filter(
      (result): result is Extract<ResolvedObservedOpenDataTarget, { status: 'matched' }> =>
        result.status === 'matched' && allowedConfidence.has(result.confidence)
    )
    .map((result) => ({
      targetRef: result.targetRef,
      fieldKey: result.fieldKey,
      value: result.value,
      confidence: result.confidence,
      source: result.source,
    }));
}

export async function resolveOpenDataForObservedTargets(
  params: OpenDataMagicBrowseParams
): Promise<{
  host?: string;
  results: ResolvedObservedOpenDataTarget[];
  fillInstructions: OpenDataFillInstruction[];
}> {
  const client = createMagicPayClient({
    gateway: params.gateway,
  });
  const profileFacts = await client.profile.facts();
  const snapshot =
    params.snapshot ?? buildProfileFactsOpenDataSnapshot(profileFacts.facts);

  const targetRefs =
    params.targetRefs ??
    listObservedOpenDataEligibleTargetRefs({
      targets: params.targets,
      ...(params.protectedForms ? { protectedForms: params.protectedForms } : {}),
    });

  const resolved = await resolveObservedOpenDataTargets({
    targets: params.targets,
    targetRefs,
    matcherModel: params.semanticMatcherModel,
    ...(params.protectedForms ? { protectedForms: params.protectedForms } : {}),
    snapshot,
    page: { url: params.pageUrl },
  });

  return {
    ...resolved,
    fillInstructions: matchedOpenDataFillInstructions(resolved.results),
  };
}
