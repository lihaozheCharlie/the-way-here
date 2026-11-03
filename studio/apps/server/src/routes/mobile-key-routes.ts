import type { FastifyInstance } from 'fastify';
import type { AgentRuntimeRegistry } from '../runtime/agent-runtime/registry.js';
/** Only metadata and explicit actions cross HTTP. No endpoint accepts or returns a token. */
export function registerMobileKeyRoutes(app: FastifyInstance, registry: Pick<AgentRuntimeRegistry, 'mobileKeyStatus' | 'changeMobileKey'>) {
  const providers = new Set(['deepseek','zhipu','qwen','kimi','openai']);
  app.get<{Params:{provider:string}}>('/api/mobile-keys/:provider', async(request,reply) => {
    if (!providers.has(request.params.provider)) return reply.code(400).send({error:'厂商无效'});
    try { return await registry.mobileKeyStatus(request.params.provider); }
    catch { return reply.code(409).send({ error: "无法检查共享钥匙串，原本机加密备份保留。" }); }
  });
  app.post<{Params:{provider:string};Body:{action?:unknown}}>('/api/mobile-keys/:provider',async(request,reply)=> {
    const action=request.body?.action;
    if (!providers.has(request.params.provider) || (typeof action !== 'string' || !['publish','pull','remove','local'].includes(action))) return reply.code(400).send({error:'共享密钥操作无效'});
    if (!request.body || Object.keys(request.body).some(key => key !== 'action')) return reply.code(400).send({error:'此接口不接收密钥内容'});
    try { return await registry.changeMobileKey(request.params.provider,action as 'publish'|'pull'|'remove'|'local'); }
    catch { return reply.code(409).send({error:'共享钥匙串操作未完成。请检查签名能力和系统钥匙串；本机加密备份保留。'}); }
  });
}
