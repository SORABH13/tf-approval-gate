# Demo: "add a read replica to prod-db". Requires a real (throwaway) AWS
# account and a pre-existing primary RDS instance named via var.primary_db_id.
# NOT wired into automated tests -- see examples/local-demo for the
# no-cloud-creds-needed smoke test used by test/e2e and manual v0.1 verification.

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

variable "primary_db_id" {
  type        = string
  description = "Identifier of the existing primary RDS instance to replicate."
}

provider "aws" {
  region = var.region
}

resource "aws_db_instance" "read_replica" {
  identifier          = "${var.primary_db_id}-read-replica"
  replicate_source_db = var.primary_db_id
  instance_class      = "db.t3.micro"
  publicly_accessible  = false
  skip_final_snapshot = true

  tags = {
    ManagedBy = "tf-approval-gate"
  }
}
