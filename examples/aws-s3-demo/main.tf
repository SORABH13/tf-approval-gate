# Real-AWS smoke test for TF Approval Gate. Free-tier S3 bucket, created and
# destroyed in seconds -- used to prove tf_apply works end to end against a
# real cloud account (not just the local null/random provider demo).

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "region" {
  type    = string
  default = "us-east-1"
}

provider "aws" {
  region = var.region
}

resource "aws_s3_bucket" "demo" {
  bucket_prefix = "tf-approval-gate-demo-"
  force_destroy = true

  tags = {
    ManagedBy = "tf-approval-gate"
    Purpose   = "real-aws-smoke-test"
  }
}
