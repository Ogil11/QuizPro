# QuizPro - Plataforma de Gestión de Cuestionarios

QuizPro es una aplicación para crear, gestionar y resolver cuestionarios interactivos. Incluye soporte para autenticación, generación de preguntas asistida por IA y registro de resultados.

---

## Descripción del funcionamiento

QuizPro es una aplicación web basada en **Next.js** con las siguientes capacidades principales:

### Funcionalidades Principales

1. **Autenticación y Gestión de Usuarios**
   - Registro e inicio de sesión seguros mediante Roble (plataforma de backend)
   - Gestión de perfiles de usuario con estadísticas personalizadas
   - Sesiones persistentes con JWT y tokens de acceso

2. **Creación y Edición de Cuestionarios**
   - Interfaz intuitiva para crear cuestionarios manualmente
   - Soporte para múltiples tipos de preguntas con opciones configurables
   - Generación asistida por IA usando modelos Gemma/Ollama
   - Marcado de respuestas correctas y creación de lógica de puntuación
   - Edición posterior de cuestionarios existentes

3. **Resolución de Cuestionarios**
   - Interfaz limpia y responsiva para responder preguntas
   - Soporte para diferentes tipos de respuestas (opción múltiple, verdadero/falso, etc.)
   - Navegación entre preguntas con vista previa
   - Envío de intentos para evaluación automática

4. **Sistema de Puntuación y Resultados**
   - Cálculo automático de puntuaciones basado en respuestas correctas
   - Visualización de resultados con gráficos y estadísticas
   - Almacenamiento de intentos para seguimiento histórico
   - Página de perfiles con análisis de desempeño

5. **Dashboard Inteligente**
   - Lista centralizada de todos los cuestionarios disponibles
   - Filtrado y búsqueda de cuestionarios
   - Acceso rápido a crear, editar o resolver cuestionarios
   - Estadísticas de uso y actividad

### Flujo Típico de Usuario

```
1. Usuario se registra o inicia sesión
   ↓
2. Visualiza el dashboard con cuestionarios disponibles
   ↓
3. Opción A: Crear un nuevo cuestionario manualmente o con IA
   Opción B: Seleccionar un cuestionario existente para resolver
   ↓
4. Si resuelve: Responde las preguntas y envía
   ↓
5. Visualiza resultados y análisis de desempeño
   ↓
6. Accede a perfil para ver historial de intentos
```

---

## Capturas de pantalla

### Página de inicio de sesión
![Página de inicio de sesión](./Screenshots/login.png)

### Panel principal (Dashboard)
![Panel principal](./Screenshots/dashboard.png)

### Constructor de cuestionarios
![Constructor de cuestionarios](./Screenshots/quiz-builder.png)

### Resolución de cuestionarios
![Resolución de cuestionarios](./Screenshots/quiz-play.png)

### Resultados y análisis
![Resultados y análisis](./Screenshots/results.png)

### Perfil de usuario
![Perfil de usuario](./Screenshots/profile.png)

---

## Stack tecnológico

| Categoría | Tecnologías |
|-----------|-------------|
| **Frontend** | Next.js 14, React 18, TypeScript |
| **Estilos** | Tailwind CSS, Radix UI, shadcn/ui |
| **Autenticación** | NextAuth v4 con JWT |
| **Backend** | Next.js API Routes, Roble (backend externo) |
| **Base de Datos** | PostgreSQL, Prisma ORM |
| **IA** | Ollama/Gemma |
| **Componentes UI** | Lucide React Icons, Sonner Toasts |
| **Gestión de Estado** | React Context, NextAuth Session |

---

## Guía de instalación y ejecución local

### Requisitos previos

Asegúrese de contar con las herramientas siguientes instaladas antes de proceder:

- `Node.js` (v16 o superior)
- `npm` (o `yarn`)
- `git`
- PostgreSQL (recomendado si se utiliza Prisma)
- Ollama (opcional, para uso de modelos locales)

### Paso 1: clonar el repositorio

```bash
git clone https://github.com/Ogil11/QuizPro.git
cd QuizPro
```

### Paso 2: instalar dependencias

```bash
cd nextjs_space
npm install --legacy-peer-deps
```

Nota: se emplea `--legacy-peer-deps` para mitigar conflictos de dependencias peer.

### Paso 3: configurar variables de entorno

En la carpeta `nextjs_space/` cree un archivo `.env.local` con, como mínimo, las variables que se muestran a continuación. Ajuste los valores según su entorno:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=CAMBIE_POR_VALOR_SEGURO_32+_CARACTERES

ROBLE_BASE_URL=https://roble-api.openlab.uninorte.edu.co
ROBLE_DB_NAME=nombre_base_datos
ROBLE_QUIZ_TABLE=Quiz
ROBLE_QUESTION_TABLE=Question
ROBLE_ATTEMPT_TABLE=QuizAttempt

DATABASE_URL=postgresql://usuario:contraseña@localhost:5432/quizpro_db

GEMMA_API_URL=http://localhost:11434
GEMMA_MODEL=gemma3:4b
```

#### explicación de variables

- `NEXTAUTH_URL`: URL base de la aplicación (ej.: `http://localhost:3000`).
- `NEXTAUTH_SECRET`: secreto para firmar tokens (utilizar un valor seguro y privado).
- `ROBLE_BASE_URL`, `ROBLE_DB_NAME`: configuración de Roble si se emplea como backend.
- `ROBLE_QUIZ_TABLE`, `ROBLE_QUESTION_TABLE`, `ROBLE_ATTEMPT_TABLE`: nombres de tablas lógicas en Roble.
- `DATABASE_URL`: cadena de conexión a PostgreSQL cuando se use Prisma.
- `GEMMA_API_URL`, `GEMMA_MODEL`: configuración para uso de modelos locales (Ollama).

### Paso 4: configurar la base de datos (opcional)

Si utiliza Prisma y PostgreSQL, aplique migraciones y (opcionalmente) ejecute los seeds:

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

### Paso 5: instalar y ejecutar Ollama (opcional)

Para operar modelos locales mediante Ollama:

```bash
ollama serve
ollama pull gemma3:4b
```

Ejecute `ollama serve` en una terminal y, en otra, descargue el modelo necesario.

### Paso 6: ejecutar la aplicación

```bash
npm run dev
```

La aplicación se servirá en `http://localhost:3000` por defecto.

### Paso 7 (Alternativo): Construir para Producción

```bash
# Compilar la aplicación
npm run build

# Ejecutar en modo producción
npm run start
```

---

## Comandos útiles

```bash
# Iniciar servidor de desarrollo
npm run dev

# Compilar para producción
npm run build

# Ejecutar en producción
npm start

# Ejecutar lint
npm run lint

# Generar cliente Prisma
npx prisma generate

# Abrir Prisma Studio
npx prisma studio

# Aplicar migraciones
npx prisma migrate dev
```

---

## Solución de problemas

Error: "Cannot find module 'next'"

```bash
npm install --legacy-peer-deps
```

Error: conexión rechazada al servidor de IA (ECONNREFUSED)

- Compruebe que Ollama se está ejecutando (`ollama serve`).
- Verifique que `GEMMA_API_URL` en `.env.local` apunte al servicio correcto.

Error: fallo de conexión a la base de datos

- Confirme que PostgreSQL está en ejecución.
- Verifique la `DATABASE_URL` en `.env.local`.
- Ejecute `npx prisma db push` o `npx prisma migrate dev` según corresponda.

Puerto 3000 ocupado

```bash
npm run dev -- -p 3001
```

Error: `NEXTAUTH_SECRET` no configurado

- Proporcione un secreto seguro (mínimo 32 caracteres) en `.env.local`.

---

## Documentación técnica

Arquitectura principal del repositorio:

```
QuizPro/
   nextjs_space/
      app/                         Páginas Next.js y rutas API
         api/
            auth/[...nextauth]/       Ruta NextAuth
            signup/                   Proxy de registro Roble
            quizzes/                  CRUD y generación IA
            attempts/                 Puntuación de intentos
      components/                   Componentes React y UI
      lib/                          Utilidades y configuración
      prisma/                       Modelos de base de datos
      src/                          Módulos de características
```

### Integración Roble

- **Autenticación:** Roble maneja login/signup
- **Base de Datos:** Roble almacena Quiz, Question, QuizAttempt
- **Sesión:** JWT con token de acceso Roble

### Flujo de Creación de Cuestionarios

1. Usuario abre `/quiz/new`
2. Completa formulario de cuestionario con preguntas
3. Envía a `/api/quizzes`
4. API inserta en Roble y redirige a dashboard
5. Dashboard carga y visualiza cuestionarios

---

## Limitaciones actuales

- Persistencia de resultados basada en sesión (los resultados pueden perderse al refrescar).
- Generación de IDs de cuestionarios potencialmente inconsistente en la integración con Roble.
- Integración parcial de generación de contenido con IA.
- Carga de documentos, RAG y feedback persistente de IA no implementados.

---

## Contribución

Para contribuir:

1. Haga fork del repositorio.
2. Cree una rama descriptiva: `git checkout -b feature/descripcion`.
3. Realice commits claros y atómicos.
4. Envíe la rama al repositorio remoto y abra un pull request.

---

## Licencia

El proyecto se distribuye bajo la licencia MIT. Consulte el archivo `LICENSE` para detalles.

---

## Soporte

Para reportar problemas o sugerencias, abra un issue en el repositorio:
https://github.com/Ogil11/QuizPro/issues

---

## Enlaces útiles

- https://nextjs.org/docs
- https://next-auth.js.org/
- https://www.prisma.io/docs
- https://tailwindcss.com/docs
- https://ollama.ai/
- https://roble-api.openlab.uninorte.edu.co

---

**Última actualización:** Mayo 2026 | Versión: 1.0.0
