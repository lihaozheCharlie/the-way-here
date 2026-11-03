import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerMobileKeyRoutes } from './mobile-key-routes.js';
describe('metadata-only mobile key actions',()=>{
 it('rejects token payloads and foreign providers before calling private service',async()=>{const app=Fastify();const changeMobileKey=vi.fn();registerMobileKeyRoutes(app,{mobileKeyStatus:vi.fn(),changeMobileKey});expect((await app.inject({method:'POST',url:'/api/mobile-keys/deepseek',payload:{action:'publish',apiKey:'anonymous-forbidden'}})).statusCode).toBe(400);expect((await app.inject({method:'POST',url:'/api/mobile-keys/invalid',payload:{action:'pull'}})).statusCode).toBe(400);expect(changeMobileKey).not.toHaveBeenCalled();await app.close();});
 it('sends an explicit action only and sanitizes private failures',async()=>{const app=Fastify();const changeMobileKey=vi.fn().mockRejectedValue(new Error('anonymous-private-error'));registerMobileKeyRoutes(app,{mobileKeyStatus:vi.fn(),changeMobileKey});const result=await app.inject({method:'POST',url:'/api/mobile-keys/deepseek',payload:{action:'remove'}});expect(changeMobileKey).toHaveBeenCalledWith('deepseek','remove');expect(result.body).not.toContain('anonymous-private-error');await app.close();});
});
