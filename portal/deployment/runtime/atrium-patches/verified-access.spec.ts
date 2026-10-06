import {describe,it,expect} from 'bun:test';
import {ForbiddenException,UnauthorizedException} from '@nestjs/common';
import {AuthGuard} from './auth.guard';
import {Reflector} from '@nestjs/core';
import type {ExecutionContext} from '@nestjs/common';
function context(user?:object,organization?:object){return {getHandler:()=>()=>{},getClass:()=>class{},switchToHttp:()=>({getRequest:()=>({user,organization})})} as unknown as ExecutionContext;}
describe('Verified portal boundary',()=>{
 const guard=new AuthGuard(new Reflector());
 it('rejects anonymous requests',async()=>{await expect(guard.canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException)});
 it('rejects an existing unverified session with org membership',async()=>{await expect(guard.canActivate(context({emailVerified:false},{id:'org'}))).rejects.toBeInstanceOf(ForbiddenException)});
 it('fails closed when the verification field is missing',async()=>{await expect(guard.canActivate(context({id:'user'},{id:'org'}))).rejects.toBeInstanceOf(ForbiddenException)});
 it('still requires an organization for verified users',async()=>{await expect(guard.canActivate(context({emailVerified:true}))).rejects.toBeInstanceOf(UnauthorizedException)});
 it('admits a verified organization member',async()=>{expect(await guard.canActivate(context({emailVerified:true},{id:'org'}))).toBe(true)});
 it('keeps explicitly public handlers accessible',async()=>{const handler=()=>{};Reflect.defineMetadata('isPublic',true,handler);const ctx=context();ctx.getHandler=()=>handler;expect(await guard.canActivate(ctx)).toBe(true)});
});
