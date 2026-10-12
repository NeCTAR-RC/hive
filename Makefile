PROJECT=hive
REPO=registry.rc.nectar.org.au/nectar
DESCRIBE=$(shell git describe --tags --always)
# PEP 440-safe package version for setuptools-scm. Docker tags can't contain '+',
# so the image tag keeps the raw `git describe` form while the package version
# rewrites `<tag>-<n>-g<sha>` into the local-version form `<tag>+<n>.g<sha>`.
VERSION := $(shell git describe --tags --always | sed -e 's/-/+/' -e 's/-/./g')
IMAGE_TAG := $(if $(TAG),$(TAG),$(DESCRIBE))
IMAGE=$(REPO)/$(PROJECT):$(IMAGE_TAG)
BUILDER=docker
# In-network builds read @ardc-ui anonymously. Off-network, point this at a
# registry you have credentials for and pass NPMRC=~/.npmrc to mount them as
# a BuildKit secret (never baked into a layer).
ARDC_NPM_REGISTRY ?= https://verdaccio.artm.rc.nectar.org.au/
comma := ,
BUILDER_ARGS=$(if $(NPMRC),--secret id=npmrc$(comma)src=$(NPMRC),)
export DOCKER_BUILDKIT := 1

build:
	echo "Derived image tag: $(DESCRIBE)"
	echo "Actual image tag: $(IMAGE_TAG)"
	echo "Package version: $(VERSION)"
	$(BUILDER) build $(BUILDER_ARGS) \
	  --build-arg VERSION=$(VERSION) \
	  --build-arg ARDC_NPM_REGISTRY=$(ARDC_NPM_REGISTRY) \
	  -t $(IMAGE) .

push:
	$(BUILDER) push $(IMAGE)

# Write a local .env from the OpenStack credentials file (default: ./test-cred).
env:
	./scripts/make-env.sh $(or $(CRED),test-cred)

# Local dev loop: redis in docker, the API with reload on :8000 and the Vite
# dev server on :5173 (which proxies /api and /auth to the API).
dev:
	./scripts/dev.sh

# The same stack as background services: start, restart (API + Vite only,
# sessions survive), stop (redis too), status, and a one-shot login URL.
start restart stop status login:
	./scripts/dev-stack.sh $@

.PHONY: build push env dev start restart stop status login
