#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = require("aws-cdk-lib");
const imagify_stack_simple_1 = require("../lib/imagify-stack-simple");
const dotenv = require("dotenv");
dotenv.config();
const app = new cdk.App();
new imagify_stack_simple_1.ImagifyStack(app, 'ImagifyStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: 'ap-southeast-1', // Singapore for better latency
    },
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2lmeS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImltYWdpZnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsdUNBQXFDO0FBQ3JDLG1DQUFtQztBQUNuQyxzRUFBMkQ7QUFDM0QsaUNBQWlDO0FBRWpDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQUVoQixNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUUxQixJQUFJLG1DQUFZLENBQUMsR0FBRyxFQUFFLGNBQWMsRUFBRTtJQUNwQyxHQUFHLEVBQUU7UUFDSCxPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUI7UUFDeEMsTUFBTSxFQUFFLGdCQUFnQixFQUFFLCtCQUErQjtLQUMxRDtDQUNGLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAnc291cmNlLW1hcC1zdXBwb3J0L3JlZ2lzdGVyJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBJbWFnaWZ5U3RhY2sgfSBmcm9tICcuLi9saWIvaW1hZ2lmeS1zdGFjay1zaW1wbGUnO1xuaW1wb3J0ICogYXMgZG90ZW52IGZyb20gJ2RvdGVudic7XG5cbmRvdGVudi5jb25maWcoKTtcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxubmV3IEltYWdpZnlTdGFjayhhcHAsICdJbWFnaWZ5U3RhY2snLCB7XG4gIGVudjoge1xuICAgIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXG4gICAgcmVnaW9uOiAnYXAtc291dGhlYXN0LTEnLCAvLyBTaW5nYXBvcmUgZm9yIGJldHRlciBsYXRlbmN5XG4gIH0sXG59KTtcbiJdfQ==