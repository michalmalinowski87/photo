#!/usr/bin/env node
// @ts-nocheck
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { AppStack } from '../lib/app-stack';

const app = new App();
const stage = app.node.tryGetContext('stage') || process.env.STAGE || 'dev';
new AppStack(app, `PixiProof-${stage}`, { env: { region: process.env.CDK_DEFAULT_REGION, account: process.env.CDK_DEFAULT_ACCOUNT } , stage });

