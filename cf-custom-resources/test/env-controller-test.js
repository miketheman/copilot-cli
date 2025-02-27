// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
"use strict";

describe("Env Controller Handler", () => {
  const cfn = require("@aws-sdk/client-cloudformation");
  const { mockClient } = require('aws-sdk-client-mock');
  const sinon = require("sinon");
  const EnvController = require("../lib/env-controller");
  const LambdaTester = require("lambda-tester").noVersionCheck();
  const nock = require("nock");
  const ResponseURL = "https://cloudwatch-response-mock.example.com/";
  const LogGroup = "/aws/lambda/testLambda";
  const LogStream = "2021/06/28/[$LATEST]9b93a7dca7344adeb193d15c092dbbfd";
  const testRequestId = "f4ef1b10-c39a-44e3-99c0-fbf7e53c3943";
  let origLog = console.log;
  const testEnvStack = "mockEnvStack";
  const testWorkload = "mockWorkload";
  const testAliases = ["example.com"];
  const testParams = [
    {
      ParameterKey: "ALBWorkloads",
      ParameterValue: "my-svc,my-other-svc",
    },
    {
      ParameterKey: "Aliases",
      ParameterValue: "",
    },
  ];
  const testOutputs = [
    {
      OutputKey: "CFNExecutionRoleARN",
      OutputValue:
        "arn:aws:iam::1234567890:role/my-project-prod-CFNExecutionRole",
    },
  ];
  const cfnMock = mockClient(cfn.CloudFormationClient);

  beforeEach(() => {
    EnvController.withDefaultResponseURL(ResponseURL);
    EnvController.withDefaultLogGroup(LogGroup);
    EnvController.withDefaultLogStream(LogStream);
    EnvController.deadlineExpired = function () {
      return new Promise(function (resolve, reject) {});
    };
    // Prevent logging.
    console.log = function () {};
    EnvController.waitForStackUpdate = async function () { };
  });
  afterEach(() => {
    // Restore logger
    cfnMock.reset();
    console.log = origLog;
  });

  test("invalid operation", () => {
    const request = nock(ResponseURL)
      .put("/", (body) => {
        return (
          body.Status === "FAILED" &&
          body.Reason ===
            "Unsupported request type OOPS (Log: /aws/lambda/testLambda/2021/06/28/[$LATEST]9b93a7dca7344adeb193d15c092dbbfd)"
        );
      })
      .reply(200);

    return LambdaTester(EnvController.handler)
      .event({
        RequestType: "OOPS",
        RequestId: testRequestId,
        ResponseURL: ResponseURL,
        ResourceProperties: {
          EnvStack: testEnvStack,
          Workload: testWorkload,
          Aliases: testAliases,
          Parameters: ["ALBWorkloads", "Aliases"],
        },
      })
      .expectResolve(() => {
        expect(request.isDone()).toBe(true);
      });
  });

  describe("should maintain the physical resource id for all event RequestTypes", () => {
    const request = nock(ResponseURL)
      .persist()
      .put("/", (body) => {
        return body.PhysicalResourceId === "envcontoller/test/hello"; // Should always be set to our value instead of log stream.
      })
      .reply(200);

    afterAll(() => {
      request.persist(false);
    });

    describe("on CREATE", () => {
      const tester = LambdaTester(EnvController.handler).event({
        RequestType: "Create",
        RequestId: testRequestId,
        ResponseURL: ResponseURL,
        ResourceProperties: {
          EnvStack: "test",
          Workload: "hello",
          Parameters: [],
        },
      });

      test("physical id matches when create succeeds", () => {
        cfnMock.on(cfn.DescribeStacksCommand).callsFake(()=> {
          sinon.fake.resolves({
            Stacks: [
              {
                StackName: "test",
                Parameters: [],
                Outputs: [],
              },
            ],
          })
        });
        return tester.expectResolve(() => {
          expect(request.isDone()).toBe(true);
        });
      });

      test("physical id matches when create fails", () => {
        cfnMock.on(cfn.DescribeStacksCommand).callsFake(()=> {
          sinon.fake.rejects("unexpected error")
        });
        return tester.expectResolve(() => {
          expect(request.isDone()).toBe(true);
        });
      });
    });

    describe("on UPDATE", () => {
      const tester = LambdaTester(EnvController.handler).event({
        RequestType: "Update",
        PhysicalResourceId: "envcontoller/test/hello",
        RequestId: testRequestId,
        ResponseURL: ResponseURL,
        ResourceProperties: {
          EnvStack: "test",
          Workload: "hello",
          Parameters: [],
        },
      });

      test("physical id matches when update succeeds", () => {
        cfnMock.on(cfn.DescribeStacksCommand).callsFake(()=> {
          sinon.fake.resolves({
            Stacks: [
              {
                StackName: "test",
                Parameters: [],
                Outputs: [],
              },
            ],
          })
        });
        return tester.expectResolve(() => {
          expect(request.isDone()).toBe(true);
        });
      });

      test("physical id matches when update fails", () => {
        cfnMock.on(cfn.DescribeStacksCommand).callsFake(()=> {
          sinon.fake.rejects("unexpected error")
        });
        return tester.expectResolve(() => {
          expect(request.isDone()).toBe(true);
        });
      });
    });

    describe("on DELETE", () => {
      const tester = LambdaTester(EnvController.handler).event({
        RequestType: "Delete",
        PhysicalResourceId: "envcontoller/test/hello",
        RequestId: testRequestId,
        ResponseURL: ResponseURL,
        ResourceProperties: {
          EnvStack: "test",
          Workload: "hello",
          Parameters: [],
        },
      });

      test("physical id matches when delete succeeds", () => {
        cfnMock.on(cfn.DescribeStacksCommand).callsFake(()=> {
          sinon.fake.resolves({
            Stacks: [
              {
                StackName: "test",
                Parameters: [],
                Outputs: [],
              },
            ],
          })
        });
        return tester.expectResolve(() => {
          expect(request.isDone()).toBe(true);
        });
      });

      test("physical id matches when delete fails", () => {
        cfnMock.on(cfn.DescribeStacksCommand).callsFake(()=> {
          sinon.fake.rejects("unexpected error")
        });
        return tester.expectResolve(() => {
          expect(request.isDone()).toBe(true);
        });
      });
    });
  });

  test("fail if cannot find environment stack", () => {
    const describeStacksFake = sinon.fake.resolves({
      Stacks: [],
    });
    cfnMock.on(cfn.DescribeStacksCommand).callsFake(describeStacksFake);
    const request = nock(ResponseURL)
      .put("/", (body) => {
        return (
          body.Status === "FAILED" &&
          body.Reason ===
            "Cannot find environment stack mockEnvStack (Log: /aws/lambda/testLambda/2021/06/28/[$LATEST]9b93a7dca7344adeb193d15c092dbbfd)"
        );
      })
      .reply(200);

    return LambdaTester(EnvController.handler)
      .event({
        RequestType: "Create",
        RequestId: testRequestId,
        ResponseURL: ResponseURL,
        ResourceProperties: {
          EnvStack: testEnvStack,
          Workload: testWorkload,
          Aliases: testAliases,
          Parameters: ["ALBWorkloads", "Aliases"],
        },
      })
      .expectResolve(() => {
        sinon.assert.calledWith(
          describeStacksFake,
          sinon.match({
            StackName: "mockEnvStack",
          })
        );
        expect(request.isDone()).toBe(true);
      });
  });

  test("unexpected update stack error", () => {
    const describeStacksFake = sinon.fake.resolves({
      Stacks: [
        {
          StackName: "mockEnvStack",
          Parameters: testParams,
          Outputs: [],
        },
      ],
    });
    cfnMock.on(cfn.DescribeStacksCommand).callsFake(describeStacksFake);
    const updateStackFake = sinon.fake.throws(new Error("not apple pie"));
    cfnMock.on(cfn.UpdateStackCommand).callsFake(updateStackFake);
    const request = nock(ResponseURL)
      .put("/", (body) => {
        return (
          body.Status === "FAILED" &&
          body.Reason ===
            "not apple pie (Log: /aws/lambda/testLambda/2021/06/28/[$LATEST]9b93a7dca7344adeb193d15c092dbbfd)"
        );
      })
      .reply(200);

    return LambdaTester(EnvController.handler)
      .event({
        RequestType: "Create",
        RequestId: testRequestId,
        ResponseURL: ResponseURL,
        ResourceProperties: {
          EnvStack: testEnvStack,
          Workload: testWorkload,
          Aliases: testAliases,
          Parameters: ["ALBWorkloads", "Aliases"],
        },
      })
      .expectResolve(() => {
        sinon.assert.calledWith(
          describeStacksFake,
          sinon.match({
            StackName: "mockEnvStack",
          })
        );
        sinon.assert.calledWith(
          updateStackFake,
          sinon.match({
            Parameters: [
              {
                ParameterKey: "ALBWorkloads",
                ParameterValue: "my-svc,my-other-svc,mockWorkload",
              },
              {
                ParameterKey: "Aliases",
                ParameterValue: '{"mockWorkload":["example.com"]}',
              },
            ],
            StackName: "mockEnvStack",
            UsePreviousTemplate: true,
          })
        );
        expect(request.isDone()).toBe(true);
      });
  });

  test("Return early if nothing changes", () => {
    const describeStacksFake = sinon.fake.resolves({
      Stacks: [
        {
          StackName: "mockEnvStack",
          Parameters: [
            {
              ParameterKey: "ALBWorkloads",
              ParameterValue: "",
            },
            {
              ParameterKey: "InternalALBWorkloads",
              ParameterValue: "",
            },
            {
              ParameterKey: "Aliases",
              ParameterValue: "",
            },
            {
              ParameterKey: "EFSWorkloads",
              ParameterValue: "",
            },
            {
              ParameterKey: "NATWorkloads",
              ParameterValue: "",
            },
          ],
          Outputs: testOutputs,
        },
      ],
    });
    cfnMock.on(cfn.DescribeStacksCommand).callsFake(describeStacksFake);
    const updateStackFake = sinon.stub();
    cfnMock.on(cfn.UpdateStackCommand).callsFake(updateStackFake);

    const request = nock(ResponseURL)
      .put("/", (body) => {
        return (
          body.Status === "SUCCESS" &&
          body.Data.CFNExecutionRoleARN ===
            "arn:aws:iam::1234567890:role/my-project-prod-CFNExecutionRole"
        );
      })
      .reply(200);

    return LambdaTester(EnvController.handler)
      .event({
        RequestType: "Update",
        RequestId: testRequestId,
        ResponseURL: ResponseURL,
        ResourceProperties: {
          EnvStack: testEnvStack,
          Workload: "my-svc",
          Parameters: ["Aliases"],
        },
      })
      .expectResolve(() => {
        sinon.assert.calledWith(
          describeStacksFake,
          sinon.match({
            StackName: "mockEnvStack",
          })
        );
        sinon.assert.notCalled(updateStackFake);
        expect(request.isDone()).toBe(true);
      });
  });

  test("Remove the workload if the action parameter set is empty but workload is in the environment", () => {
    // GIVEN
    const fakeDescribeStacks = sinon.fake.resolves({
      Stacks: [
        {
          StackName: "mockEnvStack",
          Parameters: [
            {
              ParameterKey: "AppName",
              ParameterValue: "demo",
            },
            {
              ParameterKey: "NATWorkloads",
              ParameterValue: "frontend,api",
            },
            {
              ParameterKey: "EFSWorkloads",
              ParameterValue: "api",
            },
            {
              ParameterKey: "ALBWorkloads",
              ParameterValue: "frontend,api",
            },
            {
              ParameterKey: "Aliases",
              ParameterValue: '{"frontend": ["example.com"]}',
            },
          ],
          Outputs: testOutputs,
        },
      ],
    });
    const fakeUpdateStack = sinon.fake.resolves({});
    cfnMock.on(cfn.DescribeStacksCommand).callsFake(fakeDescribeStacks);
    cfnMock.on(cfn.UpdateStackCommand).callsFake(fakeUpdateStack);

    const wantedRequest = nock(ResponseURL)
      .put("/", (body) => {
        return (
          body.Status === "SUCCESS" &&
          body.Data.CFNExecutionRoleARN ===
            "arn:aws:iam::1234567890:role/my-project-prod-CFNExecutionRole"
        );
      })
      .reply(200);

    // WHEN
    const lambda = LambdaTester(EnvController.handler).event({
      RequestType: "Create",
      RequestId: testRequestId,
      ResponseURL: ResponseURL,
      ResourceProperties: {
        EnvStack: "demo-test",
        Workload: "frontend",
        Parameters: [], // Remove frontend from the env stack.
      },
    });

    // THEN
    return lambda.expectResolve(() => {
      sinon.assert.calledWith(
        fakeDescribeStacks,
        sinon.match({
          StackName: "demo-test",
        })
      );
      sinon.assert.calledWith(
        fakeUpdateStack,
        sinon.match({
          Parameters: [
            {
              ParameterKey: "AppName",
              ParameterValue: "demo",
            },
            {
              ParameterKey: "NATWorkloads",
              ParameterValue: "api",
            },
            {
              ParameterKey: "EFSWorkloads",
              ParameterValue: "api",
            },
            {
              ParameterKey: "ALBWorkloads",
              ParameterValue: "api",
            },
            {
              ParameterKey: "Aliases",
              ParameterValue: "",
            },
          ],
          StackName: "demo-test",
          UsePreviousTemplate: true,
        })
      );
      expect(wantedRequest.isDone()).toBe(true);
    });
  });

  test("Wait if the stack is updating in progress", () => {
    const describeStacksFake = sinon.fake.resolves({
      Stacks: [
        {
          StackName: "mockEnvStack",
          Parameters: testParams,
          Outputs: [],
        },
      ],
    });
    cfnMock.on(cfn.DescribeStacksCommand).callsFake(describeStacksFake);
    const updateStackFake = sinon.stub();
    updateStackFake
      .onFirstCall()
      .throws(
        new Error(
          "Stack mockEnvStack is in UPDATE_IN_PROGRESS state and can not be updated"
        )
      );
    updateStackFake.onSecondCall().resolves(null);
    cfnMock.on(cfn.UpdateStackCommand).callsFake(updateStackFake);
    const waitForStackUpdateFake = sinon.stub(EnvController, 'waitForStackUpdate');
    waitForStackUpdateFake.onFirstCall().resolves(null);
    waitForStackUpdateFake.onSecondCall().resolves(null);

    const request = nock(ResponseURL)
      .put("/", (body) => {
        return body.Status === "SUCCESS";
      })
      .reply(200);

    return LambdaTester(EnvController.handler)
      .event({
        RequestType: "Update",
        RequestId: testRequestId,
        ResponseURL: ResponseURL,
        ResourceProperties: {
          EnvStack: testEnvStack,
          Workload: testWorkload,
          Parameters: ["ALBWorkloads", "Aliases"],
        },
      })
      .expectResolve(() => {
        sinon.assert.calledWith(
          describeStacksFake,
          sinon.match({
            StackName: "mockEnvStack",
          })
        );
        sinon.assert.calledWith(
          updateStackFake,
          sinon.match({
            Parameters: [
              {
                ParameterKey: "ALBWorkloads",
                ParameterValue: "my-svc,my-other-svc,mockWorkload",
              },
              {
                ParameterKey: "Aliases",
                ParameterValue: "",
              },
            ],
            StackName: "mockEnvStack",
            UsePreviousTemplate: true,
          })
        );
        sinon.assert.calledWith(
          waitForStackUpdateFake.firstCall,
          sinon.match.any,
          "mockEnvStack"
        );
        sinon.assert.calledWith(
          waitForStackUpdateFake.secondCall,
          sinon.match.any,
          "mockEnvStack"
        );
        expect(request.isDone()).toBe(true);
      });
  });

  test("Delete successfully", () => {
    const describeStacksFake = sinon.fake.resolves({
      Stacks: [
        {
          StackName: "mockEnvStack",
          Parameters: [
            {
              ParameterKey: "ALBWorkloads",
              ParameterValue: "my-svc,my-other-svc",
            },
            {
              ParameterKey: "Aliases",
              ParameterValue: '{"my-svc": ["example.com"]}',
            },
          ],
          Outputs: [],
        },
      ],
    });
    cfnMock.on(cfn.DescribeStacksCommand).callsFake(describeStacksFake);
    const updateStackFake = sinon.fake.resolves({});
    cfnMock.on(cfn.UpdateStackCommand).callsFake(updateStackFake);
    const waitForStackUpdateFake = sinon.stub(EnvController, 'waitForStackUpdate');
    waitForStackUpdateFake.resolves(null);

    const request = nock(ResponseURL)
      .put("/", (body) => {
        return body.Status === "SUCCESS";
      })
      .reply(200);

    return LambdaTester(EnvController.handler)
      .event({
        RequestType: "Delete",
        RequestId: testRequestId,
        ResponseURL: ResponseURL,
        ResourceProperties: {
          EnvStack: testEnvStack,
          Workload: "my-svc",
          Aliases: testAliases,
          Parameters: ["ALBWorkloads", "Aliases"],
        },
      })
      .expectResolve(() => {
        sinon.assert.calledWith(
          describeStacksFake,
          sinon.match({
            StackName: "mockEnvStack",
          })
        );
        sinon.assert.calledWith(
          updateStackFake,
          sinon.match({
            Parameters: [
              {
                ParameterKey: "ALBWorkloads",
                ParameterValue: "my-other-svc",
              },
              {
                ParameterKey: "Aliases",
                ParameterValue: "",
              },
            ],
            StackName: "mockEnvStack",
            UsePreviousTemplate: true,
          })
        );
        sinon.assert.calledWith(
          waitForStackUpdateFake.firstCall,
          sinon.match.any, // or more specific argument matchers
          "mockEnvStack"
        );
        expect(request.isDone()).toBe(true);
        expect(request.isDone()).toBe(true);
      });
  });
});
