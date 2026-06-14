const jwt = require("jsonwebtoken");
const { NlpManager } = require("node-nlp");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// Setup NLP Manager
const manager = new NlpManager({ languages: ['fr'], forceNER: true, nlu: { log: false } });

// --- TRAINING DATA ---
// Salutations
manager.addDocument('fr', 'bonjour', 'greetings');
manager.addDocument('fr', 'salut', 'greetings');
manager.addDocument('fr', 'hello', 'greetings');
manager.addDocument('fr', 'aslema', 'greetings');
manager.addDocument('fr', 'sbeh el khir', 'greetings');
manager.addDocument('fr', 'chneya ahwelek', 'greetings');
manager.addDocument('fr', 'labes', 'greetings');
manager.addDocument('fr', 'slm', 'greetings');
manager.addDocument('fr', 'cc', 'greetings');
manager.addDocument('fr', 'chkounik enti', 'greetings');
manager.addDocument('fr', 'chneya taamel', 'greetings');
manager.addDocument('fr', 'chfama', 'greetings');
manager.addDocument('fr', 'bonsoir', 'greetings');

// Personnel : Congés
manager.addDocument('fr', 'nheb nekhou conge', 'personnel.conge');
manager.addDocument('fr', 'kifech naamel demande mtaa vacance', 'personnel.conge');
manager.addDocument('fr', 'nheb nerta7', 'personnel.conge');
manager.addDocument('fr', 'ani mridh lyoum', 'personnel.conge');
manager.addDocument('fr', 'je veux un congé', 'personnel.conge');
manager.addDocument('fr', 'comment demander une absence', 'personnel.conge');
manager.addDocument('fr', 'conge mte3i', 'personnel.conge');
manager.addDocument('fr', 'vacance', 'personnel.conge');
manager.addDocument('fr', 'nheb nbadel jaw', 'personnel.conge');
manager.addDocument('fr', 'kifech nsobb conge', 'personnel.conge');
manager.addDocument('fr', 'repos', 'personnel.conge');
manager.addDocument('fr', 'nheb nekhou ayamet repos', 'personnel.conge');
manager.addDocument('fr', 'nheb nekhdemch ghodwa', 'personnel.conge');
manager.addDocument('fr', 'demande d absence', 'personnel.conge');

// Personnel : Planning
manager.addDocument('fr', 'win nal9a l wa9t mtaa l khedma', 'personnel.planning');
manager.addDocument('fr', 'kifech nchouf e shift mte3i', 'personnel.planning');
manager.addDocument('fr', 'waktech nekhdem', 'personnel.planning');
manager.addDocument('fr', 'chnowa emploi mte3i', 'personnel.planning');
manager.addDocument('fr', 'mon horaire de travail', 'personnel.planning');
manager.addDocument('fr', 'wa9tech e shift', 'personnel.planning');
manager.addDocument('fr', 'nekhdem lil wala sbeh', 'personnel.planning');
manager.addDocument('fr', 'win nal9a l planning', 'personnel.planning');
manager.addDocument('fr', 'kifech naaref wa9ti', 'personnel.planning');
manager.addDocument('fr', 'emploi du temps', 'personnel.planning');
manager.addDocument('fr', 'garde', 'personnel.planning');
manager.addDocument('fr', 'kifech nbadel e shift mte3i', 'personnel.planning');

// Personnel : Pointage
manager.addDocument('fr', 'kifech npointi', 'personnel.pointage');
manager.addDocument('fr', 'win nenzel bech naamel check in', 'personnel.pointage');
manager.addDocument('fr', 'kifeh dkhoul wel khorouj', 'personnel.pointage');
manager.addDocument('fr', 'comment pointer ma presence', 'personnel.pointage');
manager.addDocument('fr', 'pointage', 'personnel.pointage');
manager.addDocument('fr', 'kifech n9ayed rohi hather', 'personnel.pointage');
manager.addDocument('fr', 'check in kifech', 'personnel.pointage');
manager.addDocument('fr', 'kifech naamel pointage', 'personnel.pointage');
manager.addDocument('fr', 'gps', 'personnel.pointage');
manager.addDocument('fr', 'localisation', 'personnel.pointage');
manager.addDocument('fr', 'ma najamtech npointi', 'personnel.pointage');
manager.addDocument('fr', 'pointi', 'personnel.pointage');

// Personnel : Salaire
manager.addDocument('fr', 'win nal9a el chahriya', 'personnel.salaire');
manager.addDocument('fr', 'fiche de paie', 'personnel.salaire');
manager.addDocument('fr', 'kifech nchouf l flous', 'personnel.salaire');
manager.addDocument('fr', 'kifech ntale3 el khlas mte3i', 'personnel.salaire');
manager.addDocument('fr', 'mon salaire', 'personnel.salaire');
manager.addDocument('fr', 'kaddeh chahriti', 'personnel.salaire');
manager.addDocument('fr', 'flousi', 'personnel.salaire');
manager.addDocument('fr', 'salaire', 'personnel.salaire');
manager.addDocument('fr', 'prime', 'personnel.salaire');
manager.addDocument('fr', 'kifech nechbed fiche de paie', 'personnel.salaire');
manager.addDocument('fr', 'imprimer fiche paie', 'personnel.salaire');

// Admin : Congés
manager.addDocument('fr', 'kifech naccepte l conge', 'admin.conge');
manager.addDocument('fr', 'win nchouf les vacances mtaa l خدامة', 'admin.conge');
manager.addDocument('fr', 'gerer les conges', 'admin.conge');
manager.addDocument('fr', 'voir les absences', 'admin.conge');
manager.addDocument('fr', 'valider conge', 'admin.conge');
manager.addDocument('fr', 'refuser conge', 'admin.conge');
manager.addDocument('fr', 'chkoun daleb vacance', 'admin.conge');
manager.addDocument('fr', 'les demandes de conges', 'admin.conge');

// Admin : Planning
manager.addDocument('fr', 'kifech nbadel l wa9t', 'admin.planning');
manager.addDocument('fr', 'gerer l emploi du temps', 'admin.planning');
manager.addDocument('fr', 'kifech nzid shift', 'admin.planning');
manager.addDocument('fr', 'affecter les horaires', 'admin.planning');
manager.addDocument('fr', 'badel planning', 'admin.planning');
manager.addDocument('fr', 'changement de shift', 'admin.planning');
manager.addDocument('fr', 'win nriguel l wa9t', 'admin.planning');

// Admin : Personnel
manager.addDocument('fr', 'kifech nzid employe', 'admin.personnel');
manager.addDocument('fr', 'ajouter un membre', 'admin.personnel');
manager.addDocument('fr', 'nheb nzid tbib', 'admin.personnel');
manager.addDocument('fr', 'gerer le personnel', 'admin.personnel');
manager.addDocument('fr', 'nouveau compte', 'admin.personnel');
manager.addDocument('fr', 'kifech nfasakh employe', 'admin.personnel');
manager.addDocument('fr', 'modifier salaire mtaa خدام', 'admin.personnel');
manager.addDocument('fr', 'zid khadem jdid', 'admin.personnel');
manager.addDocument('fr', 'creer compte', 'admin.personnel');

// Admin : Pointage
manager.addDocument('fr', 'win nchouf chkoun pointa', 'admin.pointage');
manager.addDocument('fr', 'chkoun retard', 'admin.pointage');
manager.addDocument('fr', 'les presences du jour', 'admin.pointage');
manager.addDocument('fr', 'suivi de pointage', 'admin.pointage');
manager.addDocument('fr', 'chkoun absent', 'admin.pointage');
manager.addDocument('fr', 'retard mtaa l خدامة', 'admin.pointage');
manager.addDocument('fr', 'chouf chkoun hather', 'admin.pointage');
manager.addDocument('fr', 'les pointages', 'admin.pointage');

// --- ANSWERS ---
manager.addAnswer('fr', 'greetings', '👋 Bonjour ! Comment puis-je vous aider avec l\'application Clinique RH aujourd\'hui ?');

manager.addAnswer('fr', 'personnel.conge', '📅 **Vos congés :**\nPour demander un congé, allez dans l\'onglet **Mes Congés**, puis cliquez sur le bouton \'Nouvelle demande\'. Vous pourrez ensuite suivre son état (Approuvé, Refusé, En attente) dans cette même page.');
manager.addAnswer('fr', 'personnel.planning', '🕒 **Votre emploi du temps :**\nVotre planning de la semaine est disponible dans la section **Mon Emploi du Temps**. Vous y verrez vos horaires exacts (Matin, Après-midi, Garde). Vous pouvez aussi y demander une modification si besoin.');
manager.addAnswer('fr', 'personnel.pointage', '📍 **Comment pointer :**\nVous pouvez faire votre pointage (Check-In pour l\'entrée / Check-Out pour la sortie) directement depuis votre **Tableau de Bord**. N\'oubliez pas d\'autoriser la géolocalisation sur votre navigateur et d\'être dans la zone de la clinique !');
manager.addAnswer('fr', 'personnel.salaire', '💰 **Fiche de paie :**\nVotre fiche de paie détaillée avec vos heures supplémentaires et déductions est disponible sur votre **Tableau de Bord**. Dans la case \'Salaire\', cliquez sur le lien souligné pour ouvrir et imprimer votre fiche du mois.');

manager.addAnswer('fr', 'admin.conge', '📅 **Gestion des congés :**\nVous pouvez gérer toutes les demandes dans l\'onglet **Gestion des congés**. Vous pourrez voir qui a demandé un congé, les dates, et vous pourrez **Approuver** ou **Refuser** les demandes en attente.');
manager.addAnswer('fr', 'admin.planning', '🕒 **Gestion des emplois du temps :**\nAllez dans l\'onglet **Emplois du temps**. Vous pouvez y attribuer des shifts (Matin, Après-midi, Nuit, Garde) pour chaque membre de l\'équipe et gérer les demandes de modifications (remplacements).');
manager.addAnswer('fr', 'admin.personnel', '👥 **Gestion du personnel :**\nVous pouvez ajouter un nouvel employé, modifier ses informations (grade, service, salaire) ou supprimer un compte depuis l\'onglet **Gestion du personnel**.');
manager.addAnswer('fr', 'admin.pointage', '📍 **Suivi des pointages :**\nSur votre **Tableau de bord principal**, vous avez une vue globale et instantanée sur les présences du jour, les retards (avec le nombre de minutes exact) et les absences du personnel.');

// Initialize & Train NLP Model
let isModelTrained = false;
manager.train().then(() => {
  console.log("NLP Model Trained!");
  isModelTrained = true;
});

const extractBearerToken = (req) => {
  const header = req.get?.("authorization") || req.headers?.authorization || "";
  const raw = Array.isArray(header) ? header[0] : String(header || "");
  const match = raw.match(/^\s*Bearer\s+(.+)\s*$/i);
  return match ? match[1] : "";
};

const extractJwtPayload = (req) => {
  const token = extractBearerToken(req);
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

const resolveCaller = (req) => {
  const payload = extractJwtPayload(req);
  return {
    matricule: payload?.matricule || "",
    role: String(payload?.role || "").trim(),
    prenom: payload?.prenom || "Utilisateur",
    nom: payload?.nom || "",
  };
};

const handleChat = async (req, res) => {
  try {
    const { message } = req.body;
    const caller = resolveCaller(req);
    
    if (!message) {
      return res.status(400).json({ message: "Le message est requis." });
    }

    if (!isModelTrained) {
      return res.json({ reply: "L'intelligence artificielle est en cours de démarrage, veuillez réessayer dans quelques secondes..." });
    }

    // Process the intent using NLP model
    const response = await manager.process('fr', message);
    
    let replyText = response.answer;

    // Filter responses based on role (Admin vs Personnel)
    const isAdmin = caller.role.toLowerCase().includes("admin");
    const intent = response.intent;

    if (intent.startsWith("admin.") && !isAdmin) {
      replyText = "Désolé, cette question concerne la gestion administrateur. Avez-vous une question concernant votre profil personnel (congé, salaire...) ?";
    } else if (intent.startsWith("personnel.") && isAdmin) {
      replyText = "Désolé, cette question concerne l'espace personnel d'un employé. Souhaitez-vous plutôt savoir comment gérer le personnel ou les plannings ?";
    }

    if (!replyText || intent === "None") {
      replyText = "🤖 **Je n'ai pas très bien compris.**\n\nEssayez de me poser la question en utilisant ces mots simples :\n- **Congés** / repos / mridh\n- **Planning** / khedma / wa9t\n- **Pointage** / dkhoul / khorouj\n- **Fiche de paie** / chahriya";
    }

    // Simulate thinking time
    setTimeout(() => {
      return res.json({ reply: replyText });
    }, 500);
    
  } catch (error) {
    console.error("Erreur Chatbot local:", error);
    return res.status(500).json({ 
      reply: "Désolé, une erreur technique m'empêche de vous répondre pour le moment." 
    });
  }
};

module.exports = {
  handleChat,
};
