import { Table } from '@aws-cdk/aws-dynamodb'
import { CfnApi } from '@aws-cdk/aws-apigatewayv2'
import { Fn } from '@aws-cdk/core'
import { createPolicyStatement } from './policies'
import { GraphQLStackMembers } from './graphql-stack'
import { ScheduledCommandStackMembers } from './scheduled-commands-stack'
import { EventsStackMembers } from './events-stack'

export const setupPermissions = (
  graphQLStack: GraphQLStackMembers,
  eventsStack: EventsStackMembers,
  readModelTables: Array<Table>,
  websocketAPI: CfnApi,
  scheduledCommandStack?: ScheduledCommandStackMembers
): void => {
  const websocketManageConnectionsPolicy = createPolicyStatement(
    [
      Fn.join(':', [
        'arn',
        Fn.ref('AWS::Partition'),
        'execute-api',
        Fn.ref('AWS::Region'),
        Fn.ref('AWS::AccountId'),
        `${websocketAPI.ref}/*`,
      ]),
    ],
    ['execute-api:ManageConnections']
  )

  const { graphQLLambda, subscriptionsStore, subscriptionNotifier, connectionsStore } = graphQLStack
  const { eventsLambda, eventsStore } = eventsStack
  graphQLLambda.addToRolePolicy(
    createPolicyStatement(
      [eventsStore.tableArn + '*'], // The '*' at the end is to also grant permissions on table indexes
      ['dynamodb:Query*', 'dynamodb:Put*', 'dynamodb:BatchGetItem', 'dynamodb:BatchWriteItem']
    )
  )
  graphQLLambda.addToRolePolicy(
    createPolicyStatement(
      [subscriptionsStore.tableArn + '*'], // The '*' at the end is to also grant permissions on table indexes
      ['dynamodb:Query*', 'dynamodb:Put*', 'dynamodb:DeleteItem', 'dynamodb:BatchWriteItem']
    )
  )
  graphQLLambda.addToRolePolicy(
    createPolicyStatement([connectionsStore.tableArn], ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DeleteItem'])
  )
  graphQLLambda.addToRolePolicy(websocketManageConnectionsPolicy)

  subscriptionNotifier.addToRolePolicy(createPolicyStatement([subscriptionsStore.tableArn], ['dynamodb:Query*']))
  subscriptionNotifier.addToRolePolicy(websocketManageConnectionsPolicy)

  eventsLambda.addToRolePolicy(
    createPolicyStatement(
      [eventsStore.tableArn + '*'], // The '*' at the end is to also grant permissions on table indexes
      ['dynamodb:Query*', 'dynamodb:Put*', 'dynamodb:BatchGetItem', 'dynamodb:BatchWriteItem']
    )
  )

  if (scheduledCommandStack) {
    const { scheduledLambda } = scheduledCommandStack
    scheduledLambda.addToRolePolicy(
      createPolicyStatement(
        [eventsStore.tableArn + '*'], // The '*' at the end is to also grant permissions on table indexes
        ['dynamodb:Query*', 'dynamodb:Put*', 'dynamodb:BatchGetItem', 'dynamodb:BatchWriteItem']
      )
    )
  }

  const tableArns = readModelTables.map((table): string => table.tableArn)
  if (tableArns.length > 0) {
    eventsLambda.addToRolePolicy(
      createPolicyStatement(tableArns, ['dynamodb:Get*', 'dynamodb:Scan*', 'dynamodb:Put*', 'dynamodb:DeleteItem*'])
    )
    graphQLLambda.addToRolePolicy(createPolicyStatement(tableArns, ['dynamodb:Query*', 'dynamodb:Scan*']))
    if (scheduledCommandStack) {
      scheduledCommandStack.scheduledLambda.addToRolePolicy(
        createPolicyStatement(tableArns, ['dynamodb:Query*', 'dynamodb:Scan*'])
      )
    }
  }
}
