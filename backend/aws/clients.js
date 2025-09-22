const { EventBridgeClient } = require('@aws-sdk/client-eventbridge');
const { SFNClient } = require('@aws-sdk/client-sfn');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { S3Client } = require('@aws-sdk/client-s3');
const { KMSClient } = require('@aws-sdk/client-kms');

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';

const baseClientConfig = {
  region,
  maxAttempts: 3,
};

const eventBridge = new EventBridgeClient(baseClientConfig);
const stepFunctions = new SFNClient(baseClientConfig);
const dynamo = new DynamoDBClient(baseClientConfig);
const docClient = DynamoDBDocumentClient.from(dynamo, {
  marshallOptions: { removeUndefinedValues: true },
  unmarshallOptions: { wrapNumbers: false },
});
const s3 = new S3Client(baseClientConfig);
const kms = new KMSClient(baseClientConfig);

module.exports = {
  region,
  eventBridge,
  stepFunctions,
  dynamo,
  docClient,
  s3,
  kms,
};
