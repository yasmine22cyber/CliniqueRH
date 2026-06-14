const { getAllServices, insertService, editService, removeService } = require("../models/serviceModel");

const normalizeDescription = (value) => {
  if (value === undefined || value === null) return "";
  return `${value}`.trim().slice(0, 500);
};

const normalizeServiceName = (value) => {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
};

const normalizeServicePhone = (value) => {
  const digits = `${value ?? ""}`.replace(/\D/g, "").slice(0, 8);
  return digits;
};

const consulteService = async (_req, res) => {
  try {
    const rows = await getAllServices();
    return res.json(rows);
  } catch (error) {
    console.error("consulteService error:", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const createService = async (req, res) => {
  try {
    const nom = normalizeServiceName(req.body?.nom || req.body?.service);
    const description = normalizeDescription(req.body?.description);
    const servicePhone = normalizeServicePhone(req.body?.numTelService ?? req.body?.servicePhone ?? req.body?.num_telephone);
    
    if (!nom) return res.status(400).json({ message: "Nom du service requis." });

    const matriculeAdmin = (req.body?.matriculeAdmin || "").toString().trim();

    const created = await insertService(nom, description, servicePhone, matriculeAdmin);
    
    return res.status(201).json({
      message: "Service cree.",
      service: { ...created, description, service_phone: servicePhone },
    });
  } catch (error) {
    console.error("createService error:", error);
    if (error.status) {
        return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const updateService = async (req, res) => {
  try {
    const serviceId = Number.parseInt(req.params?.id || "", 10);
    if (!Number.isInteger(serviceId) || serviceId <= 0) {
      return res.status(400).json({ message: "ID service invalide." });
    }

    const nextNom = normalizeServiceName(req.body?.nom || req.body?.service);
    const nextDescription = normalizeDescription(req.body?.description);
    const nextServicePhone = normalizeServicePhone(
      req.body?.numTelService ?? req.body?.servicePhone ?? req.body?.num_telephone
    );
    
    if (!nextNom) return res.status(400).json({ message: "Nom du service requis." });

    await editService(serviceId, nextNom, nextDescription, nextServicePhone);
    
    return res.json({ message: "Service mis a jour." });
  } catch (error) {
    console.error("updateService error:", error);
    if (error.status) {
        return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

const deleteService = async (req, res) => {
  try {
    const serviceId = Number.parseInt(req.params?.id || "", 10);
    if (!Number.isInteger(serviceId) || serviceId <= 0) {
      return res.status(400).json({ message: "ID service invalide." });
    }

    await removeService(serviceId);
    
    return res.json({ message: "Service supprime." });
  } catch (error) {
    console.error("deleteService error:", error);
    if (error.status) {
        return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

module.exports = {
  consulteService,
  createService,
  updateService,
  deleteService,
};