
comportamiento
/
verificar
Público
Acción para comprobar un repositorio

github.com/features/acciones
Licencia
 licencia MIT
 3,5k estrellas 1,2k horquillas 
Código
Cuestiones
290
Solicitudes de extracción
62
Discusiones
Comportamiento
Proyectos
Seguridad
Perspectivas
acciones/pago
Usa esta acción de GitHub con tu proyecto
Agregue esta acción a un flujo de trabajo existente o cree uno nuevo.

Última confirmación
@estacada
estacada
…
hace 2 días
Estadísticas de Git
archivos
LÉAME.md
Construir y probar

Pago V3
Esta acción verifica su repositorio en $GITHUB_WORKSPACE, para que su flujo de trabajo pueda acceder a él.

De forma predeterminada, solo se obtiene una única confirmación para la referencia/SHA que activó el flujo de trabajo. Configúrelo fetch-depth: 0para obtener todo el historial de todas las sucursales y etiquetas. Consulte aquí para saber qué $GITHUB_SHApuntos de compromiso se asignan para diferentes eventos.

El token de autenticación se conserva en la configuración local de git. Esto permite que sus scripts ejecuten comandos git autenticados. El token se elimina durante la limpieza posterior al trabajo. Configurado persist-credentials: falsepara optar por no participar.

Cuando Git 2.18 o superior no está en su RUTA, recurra a la API REST para descargar los archivos.

Qué hay de nuevo
Actualizado al tiempo de ejecución de node16 por defecto
Esto requiere una versión mínima de Actions Runner de v2.285.0 para ejecutarse, que está disponible de forma predeterminada en GHES 3.4 o posterior.
Uso
- uses: actions/checkout@v3
  with:
    # Repository name with owner. For example, actions/checkout
    # Default: ${{ github.repository }}
    repository: ''

    # The branch, tag or SHA to checkout. When checking out the repository that
    # triggered a workflow, this defaults to the reference or SHA for that event.
    # Otherwise, uses the default branch.
    ref: ''

    # Personal access token (PAT) used to fetch the repository. The PAT is configured
    # with the local git config, which enables your scripts to run authenticated git
    # commands. The post-job step removes the PAT.
    #
    # We recommend using a service account with the least permissions necessary. Also
    # when generating a new PAT, select the least scopes necessary.
    #
    # [Learn more about creating and using encrypted secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets)
    #
    # Default: ${{ github.token }}
    token: ''

    # SSH key used to fetch the repository. The SSH key is configured with the local
    # git config, which enables your scripts to run authenticated git commands. The
    # post-job step removes the SSH key.
    #
    # We recommend using a service account with the least permissions necessary.
    #
    # [Learn more about creating and using encrypted secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets)
    ssh-key: ''

    # Known hosts in addition to the user and global host key database. The public SSH
    # keys for a host may be obtained using the utility `ssh-keyscan`. For example,
    # `ssh-keyscan github.com`. The public key for github.com is always implicitly
    # added.
    ssh-known-hosts: ''

    # Whether to perform strict host key checking. When true, adds the options
    # `StrictHostKeyChecking=yes` and `CheckHostIP=no` to the SSH command line. Use
    # the input `ssh-known-hosts` to configure additional hosts.
    # Default: true
    ssh-strict: ''

    # Whether to configure the token or SSH key with the local git config
    # Default: true
    persist-credentials: ''

    # Relative path under $GITHUB_WORKSPACE to place the repository
    path: ''

    # Whether to execute `git clean -ffdx && git reset --hard HEAD` before fetching
    # Default: true
    clean: ''

    # Number of commits to fetch. 0 indicates all history for all branches and tags.
    # Default: 1
    fetch-depth: ''

    # Whether to download Git-LFS files
    # Default: false
    lfs: ''

    # Whether to checkout submodules: `true` to checkout submodules or `recursive` to
    # recursively checkout submodules.
    #
    # When the `ssh-key` input is not provided, SSH URLs beginning with
    # `git@github.com:` are converted to HTTPS.
    #
    # Default: false
    submodules: ''

    # Add repository path as safe.directory for Git global config by running `git
    # config --global --add safe.directory <path>`
    # Default: true
    set-safe-directory: ''

    # The base URL for the GitHub instance that you are trying to clone from, will use
    # environment defaults to fetch from the same instance that the workflow is
    # running from unless specified. Example URLs are https://github.com or
    # https://my-ghes-server.example.com
    github-server-url: ''
Escenarios
Obtener todo el historial de todas las etiquetas y ramas
Consulta otra sucursal
Pagar CABEZA^
Pago de varios repositorios (uno al lado del otro)
Pago de varios repositorios (anidados)
Pago de varios repositorios (privado)
Compromiso HEAD de solicitud de extracción de pago en lugar de compromiso de fusión
Solicitud de extracción de pago en evento cerrado
Empuje una confirmación usando el token incorporado
Obtener todo el historial de todas las etiquetas y ramas
- uses: actions/checkout@v3
  with:
    fetch-depth: 0
Consulta otra sucursal
- uses: actions/checkout@v3
  with:
    ref: my-branch
Pagar CABEZA^
- uses: actions/checkout@v3
  with:
    fetch-depth: 2
- run: git checkout HEAD^
Pago de varios repositorios (uno al lado del otro)
- name: Checkout
  uses: actions/checkout@v3
  with:
    path: main

- name: Checkout tools repo
  uses: actions/checkout@v3
  with:
    repository: my-org/my-tools
    path: my-tools
Si su repositorio secundario es privado, deberá agregar la opción indicada en Checkout multiple repos (private)
Pago de varios repositorios (anidados)
- name: Checkout
  uses: actions/checkout@v3

- name: Checkout tools repo
  uses: actions/checkout@v3
  with:
    repository: my-org/my-tools
    path: my-tools
Si su repositorio secundario es privado, deberá agregar la opción indicada en Checkout multiple repos (private)
Pago de varios repositorios (privado)
- name: Checkout
  uses: actions/checkout@v3
  with:
    path: main

- name: Checkout private tools
  uses: actions/checkout@v3
  with:
    repository: my-org/my-private-tools
    token: ${{ secrets.GH_PAT }} # `GH_PAT` is a secret that contains your PAT
    path: my-tools
${{ github.token }}está en el ámbito del repositorio actual, por lo que si desea obtener un repositorio diferente que sea privado, deberá proporcionar su propia PAT .
Compromiso HEAD de solicitud de extracción de pago en lugar de compromiso de fusión
- uses: actions/checkout@v3
  with:
    ref: ${{ github.event.pull_request.head.sha }}
Solicitud de extracción de pago en evento cerrado
on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, closed]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
Empuje una confirmación usando el token incorporado
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: |
          date > generated.txt
          git config user.name github-actions
          git config user.email github-actions@github.com
          git add .
          git commit -m "generated"
          git push
Licencia
Los scripts y la documentación de este proyecto se publican bajo la licencia MIT.

Lanzamientos 22
v3.2.0
El último
hace 3 semanas
