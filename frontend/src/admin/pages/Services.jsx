import { useCallback, useEffect, useMemo, useState } from "react";
import "../../admin/admin.css";
import ServiceCreateModal from "../components/ServiceCreateModal";
import ServiceDeleteModal from "../components/ServiceDeleteModal";
import ServiceEditModal from "../components/ServiceEditModal";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const PAGE_SIZE = 7;

const INITIAL_FORM = { nom: "", description: "", numTelService: "" };

const normalizePhone = (value) => (value || "").toString().replace(/\D/g, "");
const normalizeServiceInput = (value) => {
  const raw = `${value ?? ""}`.replace(/^\s+/, "");
  if (!raw) return "";
  return raw[0].toLocaleUpperCase("fr-FR") + raw.slice(1);
};

const formatPhone = (value) => {
  const digits = normalizePhone(value);
  if (digits.length === 8)
    return `+216 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)}`;
  return digits || "Non renseigne";
};

const normalizeText = (value) =>
  `${value ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeServiceNameClient = (value) =>
  normalizeText(value).replace(/\s+/g, " ");
const toGradeLabel = (item) => {
  if (!item) return "";
  return (
    item.type_de_grade ||
    item.label ||
    item.nom ||
    item.type ||
    item.name ||
    ""
  ).toString();
};

const canonicalGrade = (value, gradeOptions = []) => {
  const cleaned = `${value ?? ""}`.trim();
  if (!cleaned) return "";
  const matched = (Array.isArray(gradeOptions) ? gradeOptions : []).find(
    (grade) => normalizeText(grade) === normalizeText(cleaned),
  );
  return matched || cleaned;
};

const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

export default function ServicesPage() {
  const [services, setServices] = useState([]);
  const [personnelRows, setPersonnelRows] = useState([]);
  const [gradeOptions, setGradeOptions] = useState([]);
  const [tooltipState, setTooltipState] = useState({ id: null, direction: "down" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [deletedServiceName, setDeletedServiceName] = useState("");
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [formErrors, setFormErrors] = useState({});

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // create | edit
  const [editId, setEditId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);

  const clearAlerts = () => {
    setError("");
    setSuccessMessage("");
  };

  const closeModal = () => {
    setShowModal(false);
    setModalMode("create");
    setEditId(null);
    setForm(INITIAL_FORM);
    setFormErrors({});
    setError("");
  };

  const closeDeleteModal = () => {
    if (deleteTarget && busyId === deleteTarget.id) return;
    setDeleteTarget(null);
  };

  const closeDeleteSuccessModal = () => {
    setDeletedServiceName("");
  };

  const resetSearch = () => {
    setQuery("");
    setCurrentPage(1);
    loadData();
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const servicesResp = await fetch(`${API_BASE_URL}/api/services`);
      const servicesData = await servicesResp.json().catch(() => []);
      if (!servicesResp.ok)
        throw new Error(
          servicesData?.message || "Chargement services impossible.",
        );

      const normalizedRows = (
        Array.isArray(servicesData) ? servicesData : []
      ).sort((a, b) =>
        (a?.service || "").localeCompare(b?.service || "", "fr"),
      );
      setServices(normalizedRows);
    } catch (e) {
      setServices([]);
      setError(e.message || "Erreur serveur."); setTimeout(() => setError(""), 4000);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPersonnel = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/personnel`);
      const data = await resp.json().catch(() => []);
      setPersonnelRows(Array.isArray(data) ? data : []);
    } catch {
      setPersonnelRows([]);
    }
  }, []);

  const loadGrades = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/grades`);
      const data = await resp.json().catch(() => []);
      if (!resp.ok) {
        setGradeOptions([]);
        return;
      }
      const labels = (Array.isArray(data) ? data : [])
        .map(toGradeLabel)
        .map((v) => v.trim())
        .filter(Boolean);
      const uniq = [];
      labels.forEach((label) => {
        const exists = uniq.some((item) => normalizeText(item) === normalizeText(label));
        if (!exists) uniq.push(label);
      });
      setGradeOptions(uniq);
    } catch {
      setGradeOptions([]);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadPersonnel();
    loadGrades();
  }, [loadData, loadPersonnel, loadGrades]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timer = setTimeout(() => setSuccessMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(""), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  const currentEditService = useMemo(
    () => services.find((row) => String(row.id) === String(editId)) || null,
    [services, editId],
  );

  const personnelByNormalizedService = useMemo(() => {
    const grouped = {};
    personnelRows.forEach((row) => {
      const key = normalizeServiceNameClient(row?.service || "");
      if (!key) return;
      if (!grouped[key]) grouped[key] = [];
      const fullName =
        `${row?.prenom || ""} ${row?.nom || ""}`.trim() ||
        `${row?.matricule || ""}`.trim() ||
        "Personnel";
      const matricule = `${row?.matricule ?? ""}`.trim();
      if (!matricule) return;
      const grade = canonicalGrade(row?.grade, gradeOptions);
      grouped[key].push({ matricule, fullName, grade });
    });
    Object.keys(grouped).forEach((key) => {
      grouped[key] = grouped[key]
        .filter(
          (entry, idx, arr) =>
            arr.findIndex((item) => item.matricule === entry.matricule) === idx,
        )
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "fr"));
    });
    return grouped;
  }, [personnelRows, gradeOptions]);

  const getPersonnelForService = useCallback(
    (serviceName) => {
      const key = normalizeServiceNameClient(serviceName);
      if (!key) return [];
      return personnelByNormalizedService[key] || [];
    },
    [personnelByNormalizedService],
  );
  const deletePersonnelMembers = useMemo(
    () => getPersonnelForService(deleteTarget?.service || ""),
    [deleteTarget, getPersonnelForService],
  );
  const isDeleteBlocked =
    deletePersonnelMembers.length > 0 ||
    Number(deleteTarget?.employee_count || 0) > 0;

  const filteredRows = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return services;
    return services.filter((row) =>
      [
        row.service,
        row.description,
        row.chef_de_service,
        row.num_telephone,
        row.chef_num_telephone,
      ]
        .map((v) => normalizeText(v))
        .some((v) => v.includes(normalizedQuery)),
    );
  }, [query, services]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE)),
    [filteredRows.length],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pageStartIndex = (currentPage - 1) * PAGE_SIZE;
  const pageEndIndex = pageStartIndex + PAGE_SIZE;
  const paginatedRows = useMemo(
    () => filteredRows.slice(pageStartIndex, pageEndIndex),
    [filteredRows, pageStartIndex, pageEndIndex],
  );

  const displayStart = filteredRows.length === 0 ? 0 : pageStartIndex + 1;
  const displayEnd =
    filteredRows.length === 0 ? 0 : Math.min(pageEndIndex, filteredRows.length);

  const normalizedPhoneInput = useMemo(
    () => normalizePhone(form.numTelService).slice(0, 8),
    [form.numTelService],
  );
  const formName = normalizeServiceInput(form.nom).trim();
  const formDescription = (form.description || "").trim();
  const normalizedTargetName = useMemo(
    () => normalizeServiceNameClient(formName),
    [formName],
  );

  const isServiceNameDuplicate = useMemo(() => {
    if (!normalizedTargetName) return false;
    return services.some((row) => {
      if (modalMode === "edit" && String(row.id) === String(editId))
        return false;
      return normalizeServiceNameClient(row.service) === normalizedTargetName;
    });
  }, [services, modalMode, editId, normalizedTargetName]);

  const isEditUnchanged = useMemo(() => {
    if (modalMode !== "edit" || !currentEditService) return false;
    return (
      formName === (currentEditService.service || "") &&
      formDescription === (currentEditService.description || "") &&
      normalizedPhoneInput ===
        normalizePhone(
          currentEditService.service_phone ||
            currentEditService.num_telephone ||
            "",
        )
    );
  }, [
    modalMode,
    currentEditService,
    formName,
    formDescription,
    normalizedPhoneInput,
  ]);

  const updateForm = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setFormErrors((prev) => {
      const next = { ...prev };
      Object.keys(patch).forEach((key) => {
        if (next[key]) delete next[key];
      });
      return next;
    });
  };
  const openCreateModal = () => {
    clearAlerts();
    setModalMode("create");
    setEditId(null);
    setForm(INITIAL_FORM);
    setFormErrors({});
    setShowModal(true);
  };

  const openEditModal = (row) => {
    clearAlerts();
    setModalMode("edit");
    setEditId(row.id);
    setForm({
      nom: row.service || "",
      description: row.description || "",
      numTelService: normalizePhone(
        row.service_phone || row.num_telephone || "",
      ).slice(0, 8),
    });
    setFormErrors({});
    setShowModal(true);
  };

  const submitService = async (event) => {
    event.preventDefault();
    setFormErrors({});

    const nextErrors = {};
    if (!formName) {
      nextErrors.nom = "Nom du service requis.";
    } else if (isServiceNameDuplicate) {
      nextErrors.nom = "Ce service existe deja.";
    }
    if (!normalizedPhoneInput) {
      nextErrors.numTelService = "Numero telephone service requis.";
    } else if (!/^\d{8}$/.test(normalizedPhoneInput)) {
      nextErrors.numTelService =
        "Numero telephone service invalide (8 chiffres).";
    }
    if (Object.keys(nextErrors).length) {
      setFormErrors(nextErrors);
      return;
    }
    if (modalMode === "edit" && isEditUnchanged) {
      closeModal();
      return;
    }

    try {
      setSaving(true);
      clearAlerts();

      const isCreate = modalMode === "create";
      const endpoint = isCreate
        ? `${API_BASE_URL}/api/services`
        : `${API_BASE_URL}/api/services/${encodeURIComponent(editId)}`;

      const resp = await fetch(endpoint, {
        method: isCreate ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: normalizeServiceInput(formName),
          description: formDescription,
          numTelService: normalizedPhoneInput,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.message || "Operation impossible.");

      await loadData();
      closeModal();
      setSuccessMessage(isCreate ? "Service cree." : "Service modifie."); setTimeout(() => setSuccessMessage(""), 4000);
    } catch (e) {
      setError(e.message || "Erreur serveur."); setTimeout(() => setError(""), 4000);
    } finally {
      setSaving(false);
    }
  };

  const openDeleteModal = (row) => {
    clearAlerts();
    setDeleteTarget(row);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const blockedCount = Number(deleteTarget.employee_count || 0);
    if (blockedCount > 0) {
      setError(
        "Impossible de supprimer ce service car il contient du personnel. Veuillez transférer ou supprimer le personnel d'abord.",
      ); setTimeout(() => setError(""), 4000);
      return;
    }

    try {
      setBusyId(deleteTarget.id);
      clearAlerts();

      const resp = await fetch(
        `${API_BASE_URL}/api/services/${encodeURIComponent(deleteTarget.id)}`,
        {
          method: "DELETE",
        },
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.message || "Suppression impossible.");

      await loadData();
      const removedName = deleteTarget.service || "";
      setDeleteTarget(null);
      setSuccessMessage("");
      setDeletedServiceName(removedName);
    } catch (e) {
      setError(e.message || "Erreur serveur."); setTimeout(() => setError(""), 4000);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="services-surface">
      <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3">
        <div className="personnel-page-title-wrap">
          <span className="personnel-page-title-line" aria-hidden="true" />
          <div>
            <h3 className="personnel-page-title mb-1">Gestion des Services</h3>
            <div className="personnel-page-subtitle">
              Suivi des services, responsables et effectifs
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn admin-accent-btn shadow-sm"
          onClick={openCreateModal}
        >
          + Ajouter Service
        </button>
      </div>

      <div className="filters-card mb-3">
        <div className="services-toolbar">
          <input
            className="form-control"
            placeholder="Rechercher..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-outline-secondary filter-btn reset-btn"
            onClick={resetSearch}
            disabled={loading}
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger services-alert mb-2">{error}</div>
      )}
      {successMessage && (
        <div className="alert alert-success services-alert mb-2">
          {successMessage}
        </div>
      )}

      <div className="services-table-wrap">
        <table className="table align-middle mb-0 services-table">
          <thead>
            <tr>
              <th className="services-col-service">Service</th>
              <th className="services-col-description">Description</th>
              <th className="services-col-count text-center">
                Nombre de Personnel
              </th>
              <th className="services-col-chef">Chef de service</th>
              <th className="services-col-phone">Numero de Telephone</th>
              <th className="services-col-actions-head">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-4">
                  Chargement...
                </td>
              </tr>
            )}

            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-4">
                  Aucun service trouve.
                </td>
              </tr>
            )}

            {!loading &&
              paginatedRows.map((row) => {
                const servicePersonnelList = getPersonnelForService(row.service);
                return (
                  <tr key={row.id}>
                    <td className="services-col-service">
                      <div className="d-flex align-items-center gap-2">
                        <span className="service-badge">
                          {row.service?.[0]?.toUpperCase() || "S"}
                        </span>
                        <span>{row.service}</span>
                      </div>
                    </td>
                    <td className="services-col-description">
                      {row.description || "-"}
                    </td>
                    <td className="services-col-count text-center">
                      <div
                        className="service-count-wrapper"
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const estimatedHeight = 260;
                          const spaceBelow = window.innerHeight - rect.bottom;
                          const direction = spaceBelow < estimatedHeight ? "up" : "down";
                          setTooltipState({ id: row.id, direction });
                        }}
                        onMouseLeave={() => setTooltipState({ id: null, direction: "down" })}
                      >
                        <span className="service-count-chip">
                          {row.employee_count || 0}
                        </span>
                        {tooltipState.id === row.id && (
                          <div
                            className={`service-tooltip ${
                              tooltipState.direction === "up" ? "up" : ""
                            }`}
                            role="tooltip"
                          >
                            <div className="service-tooltip-title">
                              Personnel ({servicePersonnelList.length || 0})
                            </div>
                            <div className="service-tooltip-body">
                              {servicePersonnelList.length ? (
                                <ul className="service-tooltip-list">
                                  {servicePersonnelList.map((person) => (
                                    <li
                                      key={`${row.id}-${person.matricule || person.fullName || "person"}`}
                                      className="service-tooltip-person"
                                    >
                                      <span className="service-tooltip-person-name">
                                        {person.fullName || "Personnel"}
                                      </span>
                                      {person.grade ? (
                                        <span className="service-tooltip-person-grade">
                                          {person.grade}
                                        </span>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <div className="text-muted small">
                                  Aucun personnel liste
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="services-col-chef">
                      <div className="d-flex align-items-center gap-2">
                        <span className="service-avatar">
                          {initials(row.chef_de_service || "C")}
                        </span>
                        <span>{row.chef_de_service || "Non defini"}</span>
                      </div>
                    </td>
                    <td className="services-col-phone">
                      {formatPhone(row.num_telephone)}
                    </td>
                    <td className="services-col-actions text-end">
                      <div className="d-inline-flex gap-2">
                        <button
                          type="button"
                          className="btn btn-sm services-action-edit"
                          onClick={() => openEditModal(row)}
                          disabled={busyId === row.id}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm services-action-delete"
                          onClick={() => openDeleteModal(row)}
                          disabled={busyId === row.id}
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <div className="services-footer">
        <div>
          Afficher {displayStart} a {displayEnd} sur {filteredRows.length}{" "}
          entrees
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            className="btn btn-sm btn-light"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          >
            Precedent
          </button>
          <span className="services-page-num">{currentPage}</span>
          <button
            className="btn btn-sm btn-light"
            disabled={currentPage >= totalPages}
            onClick={() =>
              setCurrentPage((prev) => Math.min(totalPages, prev + 1))
            }
          >
            Suivant
          </button>
        </div>
      </div>

      <ServiceEditModal
        open={showModal && modalMode === "edit"}
        currentEditService={currentEditService}
        onClose={closeModal}
        onSubmit={submitService}
        form={form}
        updateForm={updateForm}
        formErrors={formErrors}
        saving={saving}
      />

      <ServiceCreateModal
        open={showModal && modalMode === "create"}
        onClose={closeModal}
        onSubmit={submitService}
        form={form}
        updateForm={updateForm}
        formErrors={formErrors}
        saving={saving}
      />

      <ServiceDeleteModal
        open={Boolean(deleteTarget)}
        deleteTarget={deleteTarget}
        onClose={closeDeleteModal}
        busy={Boolean(deleteTarget && busyId === deleteTarget.id)}
        isDeleteBlocked={isDeleteBlocked}
        onConfirm={confirmDelete}
      />

      {deletedServiceName && (
        <div className="modal-backdrop-soft" onClick={closeDeleteSuccessModal}>
          <div
            className="modal-card success-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={closeDeleteSuccessModal}>
              {"\u00D7"}
            </button>
            <div className="d-flex align-items-start gap-3">
              <span className="success-icon" aria-hidden="true" />
              <div>
                <div className="modal-title text-success mb-1">
                  Service Supprime
                </div>
                <div className="text-muted">
                  Le service <strong>{deletedServiceName}</strong> a ete
                  supprime avec succes.
                </div>
              </div>
            </div>
            <div className="d-flex justify-content-end mt-3">
              <button
                type="button"
                className="btn btn-success btn-sm px-4"
                onClick={closeDeleteSuccessModal}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}