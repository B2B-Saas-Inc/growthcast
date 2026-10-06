// Local browser acceptance with bounded PDF uploads; in-memory private storage, no cloud credentials.
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import nodemailer from 'nodemailer';
import {documentDelivery} from '../signing/delivery.mjs';
import {deliverySecrets} from '../signing/secrets.mjs';
import {countPdfPages} from '../signing/pdf.mjs';
import {documentMailer} from '../signing/mail.mjs';
import {staffBoundary} from '../runtime/boundary.mjs';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {staffAuthenticator} from '../adapters.mjs';
import {documentIngestion,registeredArtifacts} from '../ingestion.mjs';
import {workflow} from '../workflow.mjs';
import {guestHandler} from '../http.mjs';
const pool=new pg.Pool({connectionString:readFileSync('/runtime/database-url','utf8'),ssl:{ca:readFileSync('/runtime/database-ca.crt','utf8'),rejectUnauthorized:true}});
const apiOrigin='https://api.portal.growthcast.invalid',origin='https://portal.growthcast.invalid';
const authenticateStaff=staffAuthenticator({pool,apiOrigin,portalOrigin:origin,originProof:readFileSync('/origin/api-origin','utf8').trim()});
const objects=new Map();
const storage={upload:async(key,bytes,contentType)=>{if(objects.has(key))throw Error('Overwrite denied');objects.set(key,{bytes:Buffer.from(bytes),contentType});},download:async key=>{const value=objects.get(key);if(!value)throw Error('Unavailable');return {...value,bytes:Buffer.from(value.bytes)};}};
const artifacts=registeredArtifacts({pool,storage}),flow=workflow(pool,{verifyArtifact:artifacts.verify});
const delivery=documentDelivery({pool,flow,readArtifact:artifacts.read,countPages:countPdfPages,secrets:deliverySecrets(randomBytes(32)),signingOrigin:'https://signing.growthcast.test',
 provider:{createDraft:async source=>({envelopeId:'synthetic-'+source.approvalId}),inspectDraft:async()=>{},activate:async()=>({recipientToken:'synthetic-private-token'})},
 gateway:{provision:async()=>({share:randomBytes(32).toString('base64url'),pin:'12345678'})},
 mailer:documentMailer(()=>nodemailer.createTransport({host:'mail',port:1025,secure:false,connectionTimeout:3000,socketTimeout:5000}))});
let processing=false;setInterval(async()=>{if(processing)return;processing=true;try{await delivery.runOnce();}finally{processing=false;}},500).unref();
const handler=guestHandler({origin,logo:Buffer.from('synthetic'),store:{authorize:async()=>null},authenticateStaff,staffWorkflow:flow,delivery,ingestion:documentIngestion({pool,storage}),readArtifact:artifacts.read});
http.createServer(staffBoundary({handler,deliveryEnabled:true,portalOrigin:origin,originProof:readFileSync('/origin/api-origin','utf8').trim()})).listen(3002,'0.0.0.0');
