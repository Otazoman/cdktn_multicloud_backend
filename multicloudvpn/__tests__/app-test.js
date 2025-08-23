"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Copyright (c) HashiCorp, Inc
// SPDX-License-Identifier: MPL-2.0
const cdktf_1 = require("cdktf");
require("cdktf/lib/testing/adapters/jest");
const MultiCloudVpnStack_1 = require("../stacks/MultiCloudVpnStack");
describe("MultiCloudVpnStack", () => {
    let app;
    let stack;
    beforeEach(() => {
        app = cdktf_1.Testing.app();
        stack = new MultiCloudVpnStack_1.MultiCloudVpnStack(app, "test");
    });
    test("Snapshot test", () => {
        const synth = cdktf_1.Testing.synth(stack);
        expect(synth).toMatchSnapshot();
    });
});
// describe('My CDKTF Application', () => {
//   // The tests below are example tests, you can find more information at
//   // https://cdk.tf/testing
//   it.todo('should be tested');
//   // // All Unit tests test the synthesised terraform code, it does not create real-world resources
//   // describe('Unit testing using assertions', () => {
//   //   it('should contain a resource', () => {
//   //     // import { Image,Container } from './.gen/providers/docker'
//   //     expect(
//   //       Testing.synthScope((scope) => {
//   //         new MyApplicationsAbstraction(scope, 'my-app', {});
//   //       })
//   //     ).toHaveResource(Container);
//   //     expect(
//   //       Testing.synthScope((scope) => {
//   //         new MyApplicationsAbstraction(scope, 'my-app', {});
//   //       })
//   //     ).toHaveResourceWithProperties(Image, { name: 'ubuntu:latest' });
//   //   });
//   // });
//   // describe('Unit testing using snapshots', () => {
//   //   it('Tests the snapshot', () => {
//   //     const app = Testing.app();
//   //     const stack = new TerraformStack(app, 'test');
//   //     new TestProvider(stack, 'provider', {
//   //       accessKey: '1',
//   //     });
//   //     new TestResource(stack, 'test', {
//   //       name: 'my-resource',
//   //     });
//   //     expect(Testing.synth(stack)).toMatchSnapshot();
//   //   });
//   //   it('Tests a combination of resources', () => {
//   //     expect(
//   //       Testing.synthScope((stack) => {
//   //         new TestDataSource(stack, 'test-data-source', {
//   //           name: 'foo',
//   //         });
//   //         new TestResource(stack, 'test-resource', {
//   //           name: 'bar',
//   //         });
//   //       })
//   //     ).toMatchInlineSnapshot();
//   //   });
//   // });
//   // describe('Checking validity', () => {
//   //   it('check if the produced terraform configuration is valid', () => {
//   //     const app = Testing.app();
//   //     const stack = new TerraformStack(app, 'test');
//   //     new TestDataSource(stack, 'test-data-source', {
//   //       name: 'foo',
//   //     });
//   //     new TestResource(stack, 'test-resource', {
//   //       name: 'bar',
//   //     });
//   //     expect(Testing.fullSynth(app)).toBeValidTerraform();
//   //   });
//   //   it('check if this can be planned', () => {
//   //     const app = Testing.app();
//   //     const stack = new TerraformStack(app, 'test');
//   //     new TestDataSource(stack, 'test-data-source', {
//   //       name: 'foo',
//   //     });
//   //     new TestResource(stack, 'test-resource', {
//   //       name: 'bar',
//   //     });
//   //     expect(Testing.fullSynth(app)).toPlanSuccessfully();
//   //   });
//   // });
// });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLXRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhcHAtdGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLCtCQUErQjtBQUMvQixtQ0FBbUM7QUFDbkMsaUNBQXFDO0FBQ3JDLDJDQUF5QztBQUN6QyxxRUFBa0U7QUFFbEUsUUFBUSxDQUFDLG9CQUFvQixFQUFFLEdBQUcsRUFBRTtJQUNsQyxJQUFJLEdBQVEsQ0FBQztJQUNiLElBQUksS0FBeUIsQ0FBQztJQUU5QixVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsR0FBRyxHQUFHLGVBQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwQixLQUFLLEdBQUcsSUFBSSx1Q0FBa0IsQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDOUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtRQUN6QixNQUFNLEtBQUssR0FBRyxlQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ25DLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztJQUNsQyxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDO0FBRUgsMkNBQTJDO0FBQzNDLDJFQUEyRTtBQUMzRSw4QkFBOEI7QUFDOUIsaUNBQWlDO0FBRWpDLHNHQUFzRztBQUN0Ryx5REFBeUQ7QUFDekQsaURBQWlEO0FBQ2pELHdFQUF3RTtBQUN4RSxtQkFBbUI7QUFDbkIsNkNBQTZDO0FBQzdDLG1FQUFtRTtBQUNuRSxnQkFBZ0I7QUFDaEIsd0NBQXdDO0FBRXhDLG1CQUFtQjtBQUNuQiw2Q0FBNkM7QUFDN0MsbUVBQW1FO0FBQ25FLGdCQUFnQjtBQUNoQiw2RUFBNkU7QUFDN0UsYUFBYTtBQUNiLFdBQVc7QUFFWCx3REFBd0Q7QUFDeEQsMENBQTBDO0FBQzFDLHNDQUFzQztBQUN0QywwREFBMEQ7QUFFMUQsaURBQWlEO0FBQ2pELDZCQUE2QjtBQUM3QixlQUFlO0FBRWYsNkNBQTZDO0FBQzdDLGtDQUFrQztBQUNsQyxlQUFlO0FBRWYsMkRBQTJEO0FBQzNELGFBQWE7QUFFYix3REFBd0Q7QUFDeEQsbUJBQW1CO0FBQ25CLDZDQUE2QztBQUM3QywrREFBK0Q7QUFDL0QsOEJBQThCO0FBQzlCLG1CQUFtQjtBQUVuQiwwREFBMEQ7QUFDMUQsOEJBQThCO0FBQzlCLG1CQUFtQjtBQUNuQixnQkFBZ0I7QUFDaEIsc0NBQXNDO0FBQ3RDLGFBQWE7QUFDYixXQUFXO0FBRVgsNkNBQTZDO0FBQzdDLDhFQUE4RTtBQUM5RSxzQ0FBc0M7QUFDdEMsMERBQTBEO0FBRTFELDJEQUEyRDtBQUMzRCwwQkFBMEI7QUFDMUIsZUFBZTtBQUVmLHNEQUFzRDtBQUN0RCwwQkFBMEI7QUFDMUIsZUFBZTtBQUNmLGdFQUFnRTtBQUNoRSxhQUFhO0FBRWIsb0RBQW9EO0FBQ3BELHNDQUFzQztBQUN0QywwREFBMEQ7QUFFMUQsMkRBQTJEO0FBQzNELDBCQUEwQjtBQUMxQixlQUFlO0FBRWYsc0RBQXNEO0FBQ3RELDBCQUEwQjtBQUMxQixlQUFlO0FBQ2YsZ0VBQWdFO0FBQ2hFLGFBQWE7QUFDYixXQUFXO0FBQ1gsTUFBTSIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAoYykgSGFzaGlDb3JwLCBJbmNcbi8vIFNQRFgtTGljZW5zZS1JZGVudGlmaWVyOiBNUEwtMi4wXG5pbXBvcnQgeyBBcHAsIFRlc3RpbmcgfSBmcm9tIFwiY2RrdGZcIjtcbmltcG9ydCBcImNka3RmL2xpYi90ZXN0aW5nL2FkYXB0ZXJzL2plc3RcIjtcbmltcG9ydCB7IE11bHRpQ2xvdWRWcG5TdGFjayB9IGZyb20gXCIuLi9zdGFja3MvTXVsdGlDbG91ZFZwblN0YWNrXCI7XG5cbmRlc2NyaWJlKFwiTXVsdGlDbG91ZFZwblN0YWNrXCIsICgpID0+IHtcbiAgbGV0IGFwcDogQXBwO1xuICBsZXQgc3RhY2s6IE11bHRpQ2xvdWRWcG5TdGFjaztcblxuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBhcHAgPSBUZXN0aW5nLmFwcCgpO1xuICAgIHN0YWNrID0gbmV3IE11bHRpQ2xvdWRWcG5TdGFjayhhcHAsIFwidGVzdFwiKTtcbiAgfSk7XG5cbiAgdGVzdChcIlNuYXBzaG90IHRlc3RcIiwgKCkgPT4ge1xuICAgIGNvbnN0IHN5bnRoID0gVGVzdGluZy5zeW50aChzdGFjayk7XG4gICAgZXhwZWN0KHN5bnRoKS50b01hdGNoU25hcHNob3QoKTtcbiAgfSk7XG59KTtcblxuLy8gZGVzY3JpYmUoJ015IENES1RGIEFwcGxpY2F0aW9uJywgKCkgPT4ge1xuLy8gICAvLyBUaGUgdGVzdHMgYmVsb3cgYXJlIGV4YW1wbGUgdGVzdHMsIHlvdSBjYW4gZmluZCBtb3JlIGluZm9ybWF0aW9uIGF0XG4vLyAgIC8vIGh0dHBzOi8vY2RrLnRmL3Rlc3Rpbmdcbi8vICAgaXQudG9kbygnc2hvdWxkIGJlIHRlc3RlZCcpO1xuXG4vLyAgIC8vIC8vIEFsbCBVbml0IHRlc3RzIHRlc3QgdGhlIHN5bnRoZXNpc2VkIHRlcnJhZm9ybSBjb2RlLCBpdCBkb2VzIG5vdCBjcmVhdGUgcmVhbC13b3JsZCByZXNvdXJjZXNcbi8vICAgLy8gZGVzY3JpYmUoJ1VuaXQgdGVzdGluZyB1c2luZyBhc3NlcnRpb25zJywgKCkgPT4ge1xuLy8gICAvLyAgIGl0KCdzaG91bGQgY29udGFpbiBhIHJlc291cmNlJywgKCkgPT4ge1xuLy8gICAvLyAgICAgLy8gaW1wb3J0IHsgSW1hZ2UsQ29udGFpbmVyIH0gZnJvbSAnLi8uZ2VuL3Byb3ZpZGVycy9kb2NrZXInXG4vLyAgIC8vICAgICBleHBlY3QoXG4vLyAgIC8vICAgICAgIFRlc3Rpbmcuc3ludGhTY29wZSgoc2NvcGUpID0+IHtcbi8vICAgLy8gICAgICAgICBuZXcgTXlBcHBsaWNhdGlvbnNBYnN0cmFjdGlvbihzY29wZSwgJ215LWFwcCcsIHt9KTtcbi8vICAgLy8gICAgICAgfSlcbi8vICAgLy8gICAgICkudG9IYXZlUmVzb3VyY2UoQ29udGFpbmVyKTtcblxuLy8gICAvLyAgICAgZXhwZWN0KFxuLy8gICAvLyAgICAgICBUZXN0aW5nLnN5bnRoU2NvcGUoKHNjb3BlKSA9PiB7XG4vLyAgIC8vICAgICAgICAgbmV3IE15QXBwbGljYXRpb25zQWJzdHJhY3Rpb24oc2NvcGUsICdteS1hcHAnLCB7fSk7XG4vLyAgIC8vICAgICAgIH0pXG4vLyAgIC8vICAgICApLnRvSGF2ZVJlc291cmNlV2l0aFByb3BlcnRpZXMoSW1hZ2UsIHsgbmFtZTogJ3VidW50dTpsYXRlc3QnIH0pO1xuLy8gICAvLyAgIH0pO1xuLy8gICAvLyB9KTtcblxuLy8gICAvLyBkZXNjcmliZSgnVW5pdCB0ZXN0aW5nIHVzaW5nIHNuYXBzaG90cycsICgpID0+IHtcbi8vICAgLy8gICBpdCgnVGVzdHMgdGhlIHNuYXBzaG90JywgKCkgPT4ge1xuLy8gICAvLyAgICAgY29uc3QgYXBwID0gVGVzdGluZy5hcHAoKTtcbi8vICAgLy8gICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlcnJhZm9ybVN0YWNrKGFwcCwgJ3Rlc3QnKTtcblxuLy8gICAvLyAgICAgbmV3IFRlc3RQcm92aWRlcihzdGFjaywgJ3Byb3ZpZGVyJywge1xuLy8gICAvLyAgICAgICBhY2Nlc3NLZXk6ICcxJyxcbi8vICAgLy8gICAgIH0pO1xuXG4vLyAgIC8vICAgICBuZXcgVGVzdFJlc291cmNlKHN0YWNrLCAndGVzdCcsIHtcbi8vICAgLy8gICAgICAgbmFtZTogJ215LXJlc291cmNlJyxcbi8vICAgLy8gICAgIH0pO1xuXG4vLyAgIC8vICAgICBleHBlY3QoVGVzdGluZy5zeW50aChzdGFjaykpLnRvTWF0Y2hTbmFwc2hvdCgpO1xuLy8gICAvLyAgIH0pO1xuXG4vLyAgIC8vICAgaXQoJ1Rlc3RzIGEgY29tYmluYXRpb24gb2YgcmVzb3VyY2VzJywgKCkgPT4ge1xuLy8gICAvLyAgICAgZXhwZWN0KFxuLy8gICAvLyAgICAgICBUZXN0aW5nLnN5bnRoU2NvcGUoKHN0YWNrKSA9PiB7XG4vLyAgIC8vICAgICAgICAgbmV3IFRlc3REYXRhU291cmNlKHN0YWNrLCAndGVzdC1kYXRhLXNvdXJjZScsIHtcbi8vICAgLy8gICAgICAgICAgIG5hbWU6ICdmb28nLFxuLy8gICAvLyAgICAgICAgIH0pO1xuXG4vLyAgIC8vICAgICAgICAgbmV3IFRlc3RSZXNvdXJjZShzdGFjaywgJ3Rlc3QtcmVzb3VyY2UnLCB7XG4vLyAgIC8vICAgICAgICAgICBuYW1lOiAnYmFyJyxcbi8vICAgLy8gICAgICAgICB9KTtcbi8vICAgLy8gICAgICAgfSlcbi8vICAgLy8gICAgICkudG9NYXRjaElubGluZVNuYXBzaG90KCk7XG4vLyAgIC8vICAgfSk7XG4vLyAgIC8vIH0pO1xuXG4vLyAgIC8vIGRlc2NyaWJlKCdDaGVja2luZyB2YWxpZGl0eScsICgpID0+IHtcbi8vICAgLy8gICBpdCgnY2hlY2sgaWYgdGhlIHByb2R1Y2VkIHRlcnJhZm9ybSBjb25maWd1cmF0aW9uIGlzIHZhbGlkJywgKCkgPT4ge1xuLy8gICAvLyAgICAgY29uc3QgYXBwID0gVGVzdGluZy5hcHAoKTtcbi8vICAgLy8gICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlcnJhZm9ybVN0YWNrKGFwcCwgJ3Rlc3QnKTtcblxuLy8gICAvLyAgICAgbmV3IFRlc3REYXRhU291cmNlKHN0YWNrLCAndGVzdC1kYXRhLXNvdXJjZScsIHtcbi8vICAgLy8gICAgICAgbmFtZTogJ2ZvbycsXG4vLyAgIC8vICAgICB9KTtcblxuLy8gICAvLyAgICAgbmV3IFRlc3RSZXNvdXJjZShzdGFjaywgJ3Rlc3QtcmVzb3VyY2UnLCB7XG4vLyAgIC8vICAgICAgIG5hbWU6ICdiYXInLFxuLy8gICAvLyAgICAgfSk7XG4vLyAgIC8vICAgICBleHBlY3QoVGVzdGluZy5mdWxsU3ludGgoYXBwKSkudG9CZVZhbGlkVGVycmFmb3JtKCk7XG4vLyAgIC8vICAgfSk7XG5cbi8vICAgLy8gICBpdCgnY2hlY2sgaWYgdGhpcyBjYW4gYmUgcGxhbm5lZCcsICgpID0+IHtcbi8vICAgLy8gICAgIGNvbnN0IGFwcCA9IFRlc3RpbmcuYXBwKCk7XG4vLyAgIC8vICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXJyYWZvcm1TdGFjayhhcHAsICd0ZXN0Jyk7XG5cbi8vICAgLy8gICAgIG5ldyBUZXN0RGF0YVNvdXJjZShzdGFjaywgJ3Rlc3QtZGF0YS1zb3VyY2UnLCB7XG4vLyAgIC8vICAgICAgIG5hbWU6ICdmb28nLFxuLy8gICAvLyAgICAgfSk7XG5cbi8vICAgLy8gICAgIG5ldyBUZXN0UmVzb3VyY2Uoc3RhY2ssICd0ZXN0LXJlc291cmNlJywge1xuLy8gICAvLyAgICAgICBuYW1lOiAnYmFyJyxcbi8vICAgLy8gICAgIH0pO1xuLy8gICAvLyAgICAgZXhwZWN0KFRlc3RpbmcuZnVsbFN5bnRoKGFwcCkpLnRvUGxhblN1Y2Nlc3NmdWxseSgpO1xuLy8gICAvLyAgIH0pO1xuLy8gICAvLyB9KTtcbi8vIH0pO1xuIl19