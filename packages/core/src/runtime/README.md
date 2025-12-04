# Runtime

The game runtime environment.

## Overview

This directory contains the core logic for executing the game loop, managing object interactions, and processing scripts. It is the engine that drives the Viwo world.

## Contents

- **vm.ts**: The virtual machine responsible for executing ViwoScript bytecode.
- **scheduler.ts**: Manages the scheduling and execution of tasks and events.

## Usage

These components are internal to the `core` package and are initialized during the server startup process.
