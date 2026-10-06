"use client";
import {Suspense,useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {apiFetch} from '@/lib/api';
function Verification(){
 const id=useSearchParams().get('invitationId');
 const [verified,setVerified]=useState<boolean|null>(null);
 useEffect(()=>{let cancelled=false;apiFetch<{user?:{emailVerified?:boolean}}|null>('/auth/get-session').then(s=>{if(!cancelled)setVerified(s?.user?.emailVerified===true)}).catch(()=>{if(!cancelled)setVerified(false)});return()=>{cancelled=true}},[]);
 if(verified===null)return <p>Checking verification…</p>;
 return <div className='space-y-6'><h1>{verified?'Email verified!':'Check your email'}</h1><p className='text-[var(--muted-foreground)]'>{verified?'Your email is verified. Continue to your GrowthCast portal.':'Open the verification link we sent to your email address before entering the portal.'}</p>
 <Link href={verified?(id?'/accept-invite?id='+encodeURIComponent(id):'/portal'):'/login'} className='block bg-[var(--primary)] !text-white p-3 text-center'>{verified?'Continue to portal':'Return to sign in'}</Link>
 {!verified&&<p className='text-sm text-[var(--muted-foreground)]'>Check your spam folder if the email has not arrived.</p>}</div>;
}
export default function VerifyEmail(){return <Suspense fallback={<p>Checking verification…</p>}><Verification/></Suspense>}
