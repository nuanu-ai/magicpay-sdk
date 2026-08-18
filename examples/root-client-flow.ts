import {
  createMagicPayClient,
  type MagicPayGatewayConfig,
  type MagicPayMemoryRequestKind,
  type MagicPayMemoryRequestedField,
} from '@nuanu-ai/magicpay-sdk';

export interface RootClientBridgeInput {
  pageRef?: string;
  fillRef?: string;
  scopeRef?: string;
}

export interface RootClientMemoryStep {
  kind?: MagicPayMemoryRequestKind;
  url: string;
  merchantName: string;
  fields: MagicPayMemoryRequestedField[];
  pageTitle?: string;
  formPurpose?: string;
  itemRef?: string;
  fieldRef?: string;
  targetRef?: string;
  bridge?: RootClientBridgeInput;
}

export interface RootClientActionStep {
  capability: string;
  url: string;
  merchantName: string;
  pageTitle?: string;
  itemRef?: string;
  params?: Record<string, unknown>;
  display?: {
    summary?: string;
    presentation?: Record<string, unknown>;
  };
  bridge?: RootClientBridgeInput;
}

export interface RootClientFlowParams {
  gateway: MagicPayGatewayConfig;
  sessionId: string;
  memory: RootClientMemoryStep;
  action?: RootClientActionStep;
}

function buildExampleRequestId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

function toBridgeInput(bridge: RootClientBridgeInput | undefined) {
  if (!bridge?.pageRef && !bridge?.fillRef && !bridge?.scopeRef) {
    return undefined;
  }

  return {
    ...(bridge.pageRef ? { pageRef: bridge.pageRef } : {}),
    ...(bridge.fillRef ? { fillRef: bridge.fillRef } : {}),
    ...(bridge.scopeRef ? { scopeRef: bridge.scopeRef } : {}),
  };
}

export async function runRootClientFlow(params: RootClientFlowParams) {
  const client = createMagicPayClient({
    gateway: params.gateway,
  });

  const memoryBridge = toBridgeInput(params.memory.bridge);

  const memoryHandle = await client.memory.createRequest(params.sessionId, {
    clientRequestId: buildExampleRequestId('magicpay-memory'),
    kind: params.memory.kind ?? 'memory.provide_missing',
    fields: params.memory.fields,
    ...(params.memory.itemRef ? { itemRef: params.memory.itemRef } : {}),
    ...(params.memory.fieldRef ? { fieldRef: params.memory.fieldRef } : {}),
    ...(params.memory.targetRef ? { targetRef: params.memory.targetRef } : {}),
    context: {
      url: params.memory.url,
      ...(params.memory.pageTitle ? { pageTitle: params.memory.pageTitle } : {}),
      ...(params.memory.formPurpose ? { formPurpose: params.memory.formPurpose } : {}),
      merchantName: params.memory.merchantName,
    },
    ...(memoryBridge ? { bridge: memoryBridge } : {}),
  });

  const memoryResult = await client.memory.waitForResult(params.sessionId, memoryHandle);
  if (!memoryResult.ok) {
    // Short form of the reason switch in `memory-request.ts`: a local `timeout`
    // is not terminal, so the caller keeps the request id and resumes waiting
    // instead of treating the request as failed.
    if (memoryResult.reason === 'timeout') {
      return { status: 'pending', pendingRequestId: memoryResult.requestId } as const;
    }

    throw new Error(`Memory request failed: ${memoryResult.reason}`);
  }

  if (!params.action) {
    return {
      status: 'completed',
      memoryResult,
    } as const;
  }

  const actionBridge = toBridgeInput(params.action.bridge);
  const actionHandle = await client.actions.run(params.sessionId, {
    clientRequestId: buildExampleRequestId('magicpay-action'),
    capability: params.action.capability,
    ...(params.action.itemRef ? { itemRef: params.action.itemRef } : {}),
    ...(params.action.params ? { params: params.action.params } : {}),
    ...(params.action.display ? { display: params.action.display } : {}),
    context: {
      url: params.action.url,
      ...(params.action.pageTitle ? { pageTitle: params.action.pageTitle } : {}),
      merchantName: params.action.merchantName,
    },
    ...(actionBridge ? { bridge: actionBridge } : {}),
  });

  const actionResult = await client.actions.waitForResult(params.sessionId, actionHandle);
  if (!actionResult.ok) {
    // Same rule for action requests: a local `timeout` leaves the request open.
    if (actionResult.reason === 'timeout') {
      return { status: 'pending', pendingRequestId: actionResult.requestId } as const;
    }

    throw new Error(`Action request failed: ${actionResult.reason}`);
  }

  return {
    status: 'completed',
    memoryResult,
    actionResult,
  } as const;
}
