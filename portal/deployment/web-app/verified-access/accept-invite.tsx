"use client";
import {Suspense,useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {apiFetch,setActiveOrgAndRedirect} from '@/lib/api';
async function acceptInvitation(id:string){
  const result=await apiFetch<{member?:{organizationId?:string},invitation?:{organizationId?:string}}>('/auth/organization/accept-invitation',{method:'POST',body:JSON.stringify({invitationId:id})});
  window.location.href=await setActiveOrgAndRedirect('/portal',result.member?.organizationId??result.invitation?.organizationId);
 }
function Invitation(){
 const id=useSearchParams().get('id');
 const [mode,setMode]=useState<'signup'|'login'>('signup');
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const confirmation='/verify-email?verified=true&invitationId='+encodeURIComponent(id||'');
 useEffect(()=>{
  let cancelled=false;
  apiFetch<{user?:{emailVerified?:boolean}}|null>('/auth/get-session').then(async session=>{
   if(cancelled||!id||session?.user?.emailVerified!==true)return;
   setBusy(true);try{await acceptInvitation(id!)}catch(e){if(!cancelled){setError(e instanceof Error?e.message:'Unable to accept invitation');setBusy(false)}}
  }).catch(()=>{});
  return ()=>{cancelled=true};
 },[id]);
 async function submit(event:React.FormEvent){
  event.preventDefault();setBusy(true);setError('');
  try{
   const callbackURL=window.location.origin+confirmation;
   if(mode==='signup'){
    await apiFetch('/auth/sign-up/email',{method:'POST',body:JSON.stringify({name,email,password,callbackURL})});
    window.location.href='/verify-email?invitationId='+encodeURIComponent(id||'');
   }else{
    await apiFetch('/auth/sign-in/email',{method:'POST',body:JSON.stringify({email,password,callbackURL})});
    await acceptInvitation(id!);
   }
  }catch(e){setError(e instanceof Error?e.message:'Unable to continue');setBusy(false)}
 }
 if(!id)return <div><h1>Invalid invitation</h1><p>Open the invitation link sent by your GrowthCast team.</p><Link href='/login'>Sign in</Link></div>;
 return <div className='space-y-6'><div><h1>Join your GrowthCast portal</h1><p className='text-[var(--muted-foreground)]'>{mode==='signup'?'Create an account, then verify your email to continue.':'Sign in to accept your invitation.'}</p></div>
 <form onSubmit={submit} className='space-y-4'>
 {error&&<p role='alert' className='text-red-700'>{error}</p>}
 {mode==='signup'&&<div><label htmlFor='name'>Your name</label><input id='name' required value={name} onChange={e=>setName(e.target.value)} className='w-full border p-3'/></div>}
 <div><label htmlFor='email'>Email</label><input id='email' type='email' autoComplete='email' required value={email} onChange={e=>setEmail(e.target.value)} className='w-full border p-3'/></div>
 <div><label htmlFor='password'>Password</label><input id='password' type='password' autoComplete={mode==='signup'?'new-password':'current-password'} minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} className='w-full border p-3'/></div>
 <button type='submit' disabled={busy} className='w-full p-3'>{busy?'Please wait…':mode==='signup'?'Create account':'Sign in and join'}</button>
 </form><button type='button' disabled={busy} onClick={()=>{setMode(mode==='signup'?'login':'signup');setError('')}} className='text-sm underline'>{mode==='signup'?'Already have an account? Sign in':'Create a new account'}</button></div>;
}
export default function AcceptInvite(){return <Suspense fallback={<p>Loading invitation…</p>}><Invitation/></Suspense>}
