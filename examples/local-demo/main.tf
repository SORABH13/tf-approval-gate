terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}

resource "random_pet" "demo" {
  length = 2
}

resource "null_resource" "demo" {
  triggers = {
    pet = random_pet.demo.id
  }
}
