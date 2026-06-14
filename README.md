# CliniqueRH

Application RH pour une clinique: gestion du personnel, des conges, des emplois du temps, du pointage et d'un chatbot d'assistance.

## Base de donnees PostgreSQL avec pgAdmin

Le nom recommande pour la base est `clinique`.

### 1) Creer la base dans pgAdmin

1. Ouvre pgAdmin et connecte-toi a ton serveur PostgreSQL.
2. Clique droit sur `Databases` puis `Create` > `Database...`.
3. Mets le nom `clinique`.
4. Valide avec `Save`.

Tu peux aussi le faire en SQL:

```sql
CREATE DATABASE clinique;
```

### 2) Configurer le backend

Dans le fichier `.env`, utilise la meme base:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=ton_mot_de_passe
DB_NAME=clinique

MAIL_USER=ton_adresse_email
MAIL_PASS=ton_mot_de_passe_application
APP_URL=http://localhost:5173/
APP_PUBLIC_URL=http://localhost:5173/
JWT_SECRET=une_phrase_secrete_longue

CHECKIN_GEOFENCE_LAT=35.85157
CHECKIN_GEOFENCE_LNG=10.58534
CHECKIN_GEOFENCE_RADIUS_M=120
```

### 3) Creer les tables de base

Ouvre `Query Tool` sur la base `clinique`, puis execute ce script. Il cree les tables si elles n'existent pas deja.

```sql
CREATE TABLE IF NOT EXISTS grade (
  id_grade SERIAL PRIMARY KEY,
  type_de_grade VARCHAR(120) NOT NULL,
  salaire NUMERIC(14,3) NOT NULL DEFAULT 0,
  categorie VARCHAR(30) NOT NULL DEFAULT 'medecin',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (type_de_grade, categorie)
);

CREATE TABLE IF NOT EXISTS service (
  id_service SERIAL PRIMARY KEY,
  nom_service VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  num_tel_service VARCHAR(8),
  nb_personnel_de_service INTEGER NOT NULL DEFAULT 0,
  chef_service VARCHAR(200),
  matricule_admin VARCHAR(10),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS types_conge (
  id_type_conge SERIAL PRIMARY KEY,
  libelle VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS utilisateur (
  matricule VARCHAR(10) PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  mot_de_passe TEXT NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'Personnel',
  id_grade INTEGER,
  id_service INTEGER,
  cin VARCHAR(8),
  type_contrat VARCHAR(120),
  date_embauche DATE,
  num_telephone VARCHAR(8),
  adresse TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_resets (
  email VARCHAR(150) PRIMARY KEY,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
```

### 4) Ajouter les relations

Apres creation des tables, ajoute les foreign keys de facon idempotente:

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'utilisateur'
      AND constraint_name = 'utilisateur_grade_fkey'
  ) THEN
    ALTER TABLE utilisateur
      ADD CONSTRAINT utilisateur_grade_fkey
      FOREIGN KEY (id_grade) REFERENCES grade(id_grade)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'utilisateur'
      AND constraint_name = 'utilisateur_service_fkey'
  ) THEN
    ALTER TABLE utilisateur
      ADD CONSTRAINT utilisateur_service_fkey
      FOREIGN KEY (id_service) REFERENCES service(id_service)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'service'
      AND constraint_name = 'service_matricule_admin_fkey'
  ) THEN
    ALTER TABLE service
      ADD CONSTRAINT service_matricule_admin_fkey
      FOREIGN KEY (matricule_admin) REFERENCES utilisateur(matricule)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;
```

### 5) Ordre conseille

1. Creer la base `clinique`.
2. Creer les tables avec le script SQL.
3. Ajouter les foreign keys.
4. Lancer le backend et verifier que la connexion utilise bien `DB_NAME=clinique`.

### 6) Installer et lancer le projet en local

Avant de lancer l'application, installe les dependances dans les deux dossiers:

```bash
cd backend
npm install

cd ../frontend
npm install
```

Puis demarre les deux parties du projet dans deux terminaux differents:

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

Si tout est bien configure, le backend se lance avec `node --watch server.js` et le frontend avec `vite`.
