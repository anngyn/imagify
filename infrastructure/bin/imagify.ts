#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ImagifyStack } from '../lib/imagify-stack-simple';
import * as dotenv from 'dotenv';

dotenv.config();

const app = new cdk.App();

new ImagifyStack(app, 'ImagifyStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-southeast-1', // Singapore for better latency
  },
});
