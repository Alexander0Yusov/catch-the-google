# Game Module

Module structure follows Clean Architecture:

- `domain` - entities, value objects, enums, pure business rules.
- `application` - use cases, contracts, mappers.
- `infrastructure` - repository and adapter implementations.
- `interface` - transport-facing handlers/controllers.
