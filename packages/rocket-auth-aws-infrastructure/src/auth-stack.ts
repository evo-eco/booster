import { CfnOutput, Stack } from '@aws-cdk/core'
import {
  StringAttribute,
  UserPool,
  UserPoolClient,
  VerificationEmailStyle,
  UserPoolDomain,
  UserPoolTriggers,
} from '@aws-cdk/aws-cognito'
import { Effect, PolicyStatement } from '@aws-cdk/aws-iam'
import { Cors, CorsOptions, LambdaIntegration, MethodOptions, Resource, RestApi } from '@aws-cdk/aws-apigateway'
import { createLambda } from './utils'
import { BoosterConfig } from '@boostercloud/framework-types'

export interface AWSAuthRocketParams {
  passwordPolicy?: {
    minLength?: number
    requireDigits: boolean
    requireLowercase: boolean
    requireSymbols: boolean
    requireUppercase: boolean
  }
  mode: 'Passwordless' | 'UserPassword'
}

// Defined type to unify the signature of all private methods
// we'll fill some params along the way
type ResourceParams = {
  params: AWSAuthRocketParams
  stack: Stack
  config: BoosterConfig
  rocketStackPrefixId: string
  rootResource?: Resource
  userPool?: UserPool
  userPoolClientId?: string
  defaultCorsPreflightOptions?: CorsOptions
  authApi?: RestApi
}

export class AuthStack {
  public static mountStack(params: AWSAuthRocketParams, stack: Stack, config: BoosterConfig): void {
    if (config.thereAreRoles) {
      const rocketStackPrefixId = AuthStack.rocketArtifactsPrefix(config)

      const resourceParams: ResourceParams = {
        params,
        stack,
        config,
        rocketStackPrefixId,
      }

      const { userPool, userPoolClient } = AuthStack.buildUserPoolAndUserPoolClient(resourceParams)
      resourceParams.userPool = userPool
      resourceParams.userPoolClientId = userPoolClient.userPoolClientId

      const authApi = AuthStack.createAuthResources(resourceParams)
      resourceParams.authApi = authApi

      AuthStack.printOutput(resourceParams)
    }
  }

  public static unmountStack?(): void {}

  public static rocketArtifactsPrefix(config: BoosterConfig): string {
    return `${config.appName}-${config.environmentName}-rocket-auth`
  }

  private static buildUserPoolAndUserPoolClient(
    resourceParams: ResourceParams
  ): { userPool: UserPool; userPoolClient: UserPoolClient } {
    const { params, rocketStackPrefixId, config, stack } = resourceParams

    const userPoolID = `${rocketStackPrefixId}-user-pool`
    const userPassword = params.mode === 'UserPassword'
    const lambdaTriggers = userPassword ? undefined : AuthStack.buildLambdaTriggers(resourceParams)
    const preSignUpTrigger = createLambda(
      stack,
      `${AuthStack.rocketArtifactsPrefix(config)}-pre-sign-up`,
      'pre-sign-up.handler',
      {
        rolesConfig: JSON.stringify(config.roles),
      }
    )

    const userPool = new UserPool(stack, userPoolID, {
      userPoolName: userPoolID,
      signInAliases: {
        email: true,
        phone: true,
      },
      autoVerify: {
        email: true,
        phone: true,
      },
      customAttributes: {
        role: new StringAttribute({ mutable: true }),
      },
      selfSignUpEnabled: true,
      passwordPolicy: userPassword
        ? params.passwordPolicy
        : { requireDigits: false, requireLowercase: false, requireUppercase: false, requireSymbols: false },
      userVerification: {
        emailStyle: VerificationEmailStyle.LINK,
      },
      lambdaTriggers: {
        ...lambdaTriggers,
        preSignUp: preSignUpTrigger,
      },
    })

    const localUserPoolDomainID = `${rocketStackPrefixId}-user-pool-domain`
    new UserPoolDomain(stack, localUserPoolDomainID, {
      userPool,
      cognitoDomain: { domainPrefix: config.appName },
    })

    const userPoolClientID = `${rocketStackPrefixId}-user-pool-client`

    const userPoolClient = new UserPoolClient(stack, userPoolClientID, {
      userPoolClientName: userPoolClientID,
      userPool,
      authFlows: { userPassword, custom: !userPassword },
    })

    return { userPool, userPoolClient }
  }

  public static buildLambdaTriggers(resourceParams: ResourceParams): UserPoolTriggers {
    const { rocketStackPrefixId, stack } = resourceParams

    const createAuthChallenge = createLambda(
      stack,
      `${rocketStackPrefixId}-create-auth-challenge`,
      'challenge-create.handler'
    )

    createAuthChallenge.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['sns:Publish'],
        resources: ['*'],
      })
    )

    const defineAuthChallenge = createLambda(
      stack,
      `${rocketStackPrefixId}-define-auth-challenge`,
      'challenge-define.handler'
    )

    const verifyAuthChallengeResponse = createLambda(
      stack,
      `${rocketStackPrefixId}-verify-auth-challenge`,
      'challenge-verify.handler'
    )

    return {
      createAuthChallenge,
      defineAuthChallenge,
      verifyAuthChallengeResponse,
    }
  }

  private static createAuthResources(resourceParams: ResourceParams): RestApi {
    const { rocketStackPrefixId, config, stack } = resourceParams

    const rootAuthAPI = new RestApi(stack, `${rocketStackPrefixId}-api`, {
      deployOptions: { stageName: config.environmentName },
    })

    const rootResource = rootAuthAPI.root.addResource('auth')

    const defaultCorsPreflightOptions: CorsOptions = {
      allowHeaders: ['*'],
      allowOrigins: Cors.ALL_ORIGINS,
      allowMethods: ['POST', 'OPTIONS'],
    }

    resourceParams.defaultCorsPreflightOptions = defaultCorsPreflightOptions
    resourceParams.rootResource = rootResource

    AuthStack.createSignInResources(resourceParams)
    AuthStack.createSignUpResources(resourceParams)
    AuthStack.createTokenResources(resourceParams)
    AuthStack.createPasswordResources(resourceParams)

    return rootAuthAPI
  }

  // sign-in
  private static createSignInResources(resourceParams: ResourceParams): void {
    const { rootResource, defaultCorsPreflightOptions } = resourceParams
    const signInResource = rootResource!.addResource('sign-in', { defaultCorsPreflightOptions })
    AuthStack.addIntegration(resourceParams, 'sign-in', signInResource, 'sign-in.handler', ['cognito-idp:InitiateAuth'])
  }

  // sign-up
  // sign-up/confirm
  // sign-up/resend-code
  private static createSignUpResources(resourcesParams: ResourceParams): void {
    const { rootResource, defaultCorsPreflightOptions, config } = resourcesParams
    const signUpResource = rootResource!.addResource('sign-up', { defaultCorsPreflightOptions })
    AuthStack.addIntegration(resourcesParams, 'sign-up', signUpResource, 'sign-up.handler', ['cognito-idp:SignUp'], {
      rolesConfig: JSON.stringify(config.roles),
    })

    let resource = signUpResource.addResource('confirm', { defaultCorsPreflightOptions })
    AuthStack.addIntegration(resourcesParams, 'sign-up-confirm', resource, 'sign-up-confirm.handler', [
      'cognito-idp:ConfirmSignUp',
    ])

    resource = signUpResource.addResource('resend-code', { defaultCorsPreflightOptions })
    AuthStack.addIntegration(resourcesParams, 'sign-up-resend-code', resource, 'resend-confirmation-code.handler', [
      'cognito-idp:ResendConfirmationCode',
    ])
  }

  // token
  // token/refresh
  // token/revoke
  private static createTokenResources(resourcesParams: ResourceParams): void {
    const { rootResource, defaultCorsPreflightOptions, params } = resourcesParams

    const tokenResource = rootResource!.addResource('token', { defaultCorsPreflightOptions })
    // In passwordless mode we'll have an integration to get a valid token responding to a challenge
    if (params.mode === 'Passwordless') {
      AuthStack.addIntegration(resourcesParams, 'token', tokenResource, 'challenge-answer.handler', [
        'cognito-idp:InitiateAuth',
        'cognito-idp:RespondToAuthChallenge',
      ])
    }

    let resource = tokenResource.addResource('refresh', { defaultCorsPreflightOptions })
    AuthStack.addIntegration(resourcesParams, 'refresh-token', resource, 'refresh-token.handler', [
      'cognito-idp:InitiateAuth',
    ])

    resource = tokenResource.addResource('revoke', { defaultCorsPreflightOptions })
    AuthStack.addIntegration(resourcesParams, 'revoke-token', resource, 'sign-out.handler', [
      'cognito-idp:GlobalSignOut',
    ])
  }

  // password/forgot
  // password/change
  private static createPasswordResources(resourcesParams: ResourceParams): void {
    const { rootResource, defaultCorsPreflightOptions, params } = resourcesParams
    if (params.mode !== 'UserPassword') {
      return
    }
    const passwordResource = rootResource!.addResource('password', { defaultCorsPreflightOptions })
    let resource = passwordResource.addResource('forgot', { defaultCorsPreflightOptions })
    AuthStack.addIntegration(resourcesParams, 'forgot-password', resource, 'forgot-password.handler', [
      'cognito-idp:ForgotPassword',
    ])

    resource = passwordResource.addResource('change', { defaultCorsPreflightOptions })
    AuthStack.addIntegration(resourcesParams, 'change-password', resource, 'confirm-forgot-password.handler', [
      'cognito-idp:ConfirmForgotPassword',
    ])
  }

  private static addIntegration(
    resourceParams: ResourceParams,
    name: string,
    resource: Resource,
    handler: string,
    actions: string[],
    env?: Record<string, string>
  ): void {
    const { userPool, rocketStackPrefixId, userPoolClientId, params, stack } = resourceParams

    const allowedOriginHeaderForCors = {
      'method.response.header.Access-Control-Allow-Origin': true,
    }
    const methodOptions: MethodOptions = {
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: allowedOriginHeaderForCors,
        },
        {
          statusCode: '400',
          responseParameters: allowedOriginHeaderForCors,
        },
        {
          statusCode: '500',
          responseParameters: allowedOriginHeaderForCors,
        },
      ],
    }

    const authLambda = createLambda(stack, `${rocketStackPrefixId}-${name}`, handler, {
      userPoolId: userPool!.userPoolId,
      userPoolClientId: userPoolClientId!,
      mode: params.mode,
      ...env,
    })

    resource.addMethod('POST', new LambdaIntegration(authLambda), methodOptions)

    authLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: actions,
        resources: [userPool!.userPoolArn],
      })
    )
  }

  private static printOutput(resourceParams: ResourceParams): void {
    const { stack, userPool, authApi } = resourceParams
    new CfnOutput(stack, 'AuthApiEndpoint', {
      value: authApi!.url + 'auth',
      description: 'Auth API endpoint',
    })

    const issuer = `https://cognito-idp.${stack.region}.${stack.urlSuffix}/${userPool?.userPoolId}`

    new CfnOutput(stack, 'AuthApiIssuer', {
      value: issuer,
      description: 'Auth API JWT issuer',
    })

    new CfnOutput(stack, 'AuthApiJwksUri', {
      value: issuer + '/.well-known/jwks.json',
      description: 'Auth API JKWS URI',
    })
  }
}
