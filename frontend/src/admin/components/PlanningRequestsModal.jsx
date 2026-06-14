import { useEffect, useMemo, useRef, useState } from "react";

const REQUEST_STATUS_TONES = {
  "En attente": "pending",
  "Approuvé": "approved",
  "Refusé": "refused",
  "Annulé": "canceled",
};

const toISO = (date) => {
  const pad = (val) => String(val).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const normalizeDateValue = (value) => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toISO(value);
  const str = String(value);
  return str.length >= 10 ? str.slice(0, 10) : str;
};

const normalizeLabel = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normalizeRequestStatus = (value = "") => {
  const normalized = value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (normalized.startsWith("approuv")) return "Approuvé";
  if (normalized.startsWith("refus")) return "Refusé";
  if (normalized.startsWith("annul")) return "Annulé";
  return "En attente";
};

const normalizeShiftKey = (value = "") =>
  value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeShiftLabel = (value = "") => {
  const raw = (value || "").toString().trim();
  if (!raw) return "";
  const key = normalizeShiftKey(raw);
  if (key.includes("apres")) return "Apres-midi";
  if (key.includes("garde")) return "Garde";
  if (key.includes("matin")) return "Matin";
  return raw;
};

const normalizeMatricule = (value = "") => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(0, 10).padStart(10, "0");
};

const shiftKeyFromType = (value = "") => {
  const key = normalizeShiftKey(value);
  if (!key) return "";
  if (key.startsWith("matin")) return "matin";
  if (key.includes("apres")) return "apres-midi";
  if (key.includes("garde")) return "garde";
  return key;
};

const normalizeLeaveStatusKey = (value = "") => {
  const normalized = value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (normalized.startsWith("approuv")) return "approved";
  if (normalized.startsWith("refus")) return "refused";
  if (normalized.startsWith("annul")) return "canceled";
  return "pending";
};

const isGynecologueGrade = (grade = "") => normalizeLabel(grade).includes("gynecolog");

export default function PlanningRequestsModal(props) {
  if (!props.open) return null;
  return <ModalInner {...props} />;
}

function ModalInner({
  onClose,
  requestRows,
  rows,
  personnelChoices,
  congesRows,
  requestBusyId,
  loadRequests,
  updateRequestStatus,
  createReplacementForRequest,
}) {
  const handleClose = () => {
    if (requestBusyId) return;
    onClose();
  };

  const [requestFilter, setRequestFilter] = useState("all");
  const [requestShiftFilter, setRequestShiftFilter] = useState("all");
  const [requestFilterDropdownOpen, setRequestFilterDropdownOpen] = useState(false);
  const [requestShiftDropdownOpen, setRequestShiftDropdownOpen] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [requestSuccess, setRequestSuccess] = useState("");
  const [requestSuccessTone, setRequestSuccessTone] = useState("");
  const [replaceOpenId, setReplaceOpenId] = useState(null);
  const [replaceSelectedMatricule, setReplaceSelectedMatricule] = useState("");
  const [replaceConfirmChecked, setReplaceConfirmChecked] = useState(false);

  const requestFilterDropdownRef = useRef(null);
  const requestShiftDropdownRef = useRef(null);

  // Auto-dismiss message succès (3 s) 
  useEffect(() => {
    if (!requestSuccess) return undefined;
    const timer = setTimeout(() => {
      setRequestSuccess("");
      setRequestSuccessTone("");
    }, 3000);
    return () => clearTimeout(timer);
  }, [requestSuccess]);

  //  Fermeture dropdowns au clic extérieur 
  useEffect(() => {
    if (!requestFilterDropdownOpen && !requestShiftDropdownOpen) return undefined;
    const handleClickOutside = (e) => {
      const insideFilter =
        requestFilterDropdownRef.current &&
        requestFilterDropdownRef.current.contains(e.target);
      const insideShift =
        requestShiftDropdownRef.current &&
        requestShiftDropdownRef.current.contains(e.target);
      if (!insideFilter && !insideShift) {
        setRequestFilterDropdownOpen(false);
        setRequestShiftDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [requestFilterDropdownOpen, requestShiftDropdownOpen]);

  const REQUEST_FILTER_OPTIONS = useMemo(
    () => [
      { value: "all", label: "Tous les statuts" },
      { value: "pending", label: "En attente" },
      { value: "approved", label: "Approuvés" },
      { value: "refused", label: "Refusés" },
      { value: "canceled", label: "Annulés" },
    ],
    []
  );

  const REQUEST_SHIFT_OPTIONS = useMemo(() => {
    const values = new Map();
    requestRows.forEach((row) => {
      const label = normalizeShiftLabel(row.shift_type);
      if (!label) return;
      const key = shiftKeyFromType(label) || normalizeLabel(label);
      values.set(key, label);
    });
    const items = Array.from(values.values()).sort((a, b) =>
      a.localeCompare(b, "fr", { sensitivity: "base" })
    );
    return [
      { value: "all", label: "Tous les shifts" },
      ...items.map((item) => ({ value: item, label: item })),
    ];
  }, [requestRows]);

  const hasShiftFilters = REQUEST_SHIFT_OPTIONS.length > 1;

  const requestFilterLabel = useMemo(() => {
    return (
      REQUEST_FILTER_OPTIONS.find((opt) => opt.value === requestFilter)?.label ||
      "Tous les statuts"
    );
  }, [REQUEST_FILTER_OPTIONS, requestFilter]);

  const requestShiftLabel = useMemo(() => {
    return (
      REQUEST_SHIFT_OPTIONS.find((opt) => opt.value === requestShiftFilter)?.label ||
      "Tous les shifts"
    );
  }, [REQUEST_SHIFT_OPTIONS, requestShiftFilter]);

  const filteredRequests = useMemo(() => {
    let next = requestRows;
    if (requestFilter !== "all") {
      const target =
        requestFilter === "approved"
          ? "Approuvé"
          : requestFilter === "refused"
          ? "Refusé"
          : requestFilter === "canceled"
          ? "Annulé"
          : "En attente";
      next = next.filter((row) => normalizeRequestStatus(row.statut) === target);
    }
    if (requestShiftFilter !== "all") {
      const shiftKey = shiftKeyFromType(requestShiftFilter);
      next = next.filter((row) => shiftKeyFromType(row.shift_type || "") === shiftKey);
    }
    return next;
  }, [requestRows, requestFilter, requestShiftFilter]);

 //shkoun eli hdhar : bnhar w shift kol youm
  const busyByDateShift = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const dateIso = normalizeDateValue(row.date);
      const shiftKey = shiftKeyFromType(row.type);
      if (!dateIso || !shiftKey) return;
      const key = `${dateIso}|${shiftKey}`;
      if (!map.has(key)) map.set(key, new Set());
      const m = normalizeMatricule(row.matricule || "");
      if (m) map.get(key).add(m);
    });
    return map;
  }, [rows]);
  //personnel ili3ando conge approuve
  const approvedLeaveByMatricule = useMemo(() => {
    const map = new Map();
    (congesRows || []).forEach((row) => {
      const matricule = normalizeMatricule(row?.matricule || "");
      if (!matricule) return;
      if (normalizeLeaveStatusKey(row?.statut || "") !== "approved") return;
      const startIso = normalizeDateValue(row?.date_debut);
      const endIso = normalizeDateValue(row?.date_fin);
      if (!startIso || !endIso) return;
      if (!map.has(matricule)) map.set(matricule, []);
      map.get(matricule).push({ startIso, endIso });
    });
    return map;
  }, [congesRows]);

  //  Repos obligatoire après shift nuit 
  const restByDate = useMemo(() => {
    const map = new Map();
    const addRest = (isoDate, matricule) => {
      if (!isoDate || !matricule) return;
      if (!map.has(isoDate)) map.set(isoDate, new Set());
      map.get(isoDate).add(matricule);
    };
    const addIsoDays = (isoDate, days) => {
      const normalized = normalizeDateValue(isoDate);
      if (!normalized) return "";
      const parsed = new Date(`${normalized}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) return "";
      parsed.setDate(parsed.getDate() + days);
      return toISO(parsed);
    };
    rows.forEach((row) => {
      const matricule = normalizeMatricule(row?.matricule || "");
      const dateIso = normalizeDateValue(row?.date);
      if (!matricule || !dateIso || shiftKeyFromType(row?.type) !== "garde") return;
      addRest(addIsoDays(dateIso, 1), matricule);
      addRest(addIsoDays(dateIso, 2), matricule);
    });
    return map;
  }, [rows]);

  //  Shift actuel du demandeur 
  const getCurrentShiftKeyForRequest = (requestRow) => {
    if (!requestRow) return "";
    const dateIso = normalizeDateValue(requestRow?.date_preferee);
    const requesterMatricule = normalizeMatricule(requestRow?.matricule || "");
    if (!dateIso || !requesterMatricule) return "";
    const current = rows
      .filter(
        (row) =>
          normalizeMatricule(row?.matricule || "") === requesterMatricule &&
          normalizeDateValue(row?.date) === dateIso
      )
      .sort((a, b) =>
        String(a?.start_time || "").localeCompare(String(b?.start_time || ""))
      )[0];
    return shiftKeyFromType(current?.type || "");
  };

  // Trouver remplaçant depuis le planning 
  const findReplacementMatriculeFromPlanning = (ownerMatricule, dateIso) => {
    const owner = normalizeMatricule(ownerMatricule || "");
    const ownerShort = owner.replace(/^0+/, "");
    const iso = normalizeDateValue(dateIso);
    if (!owner || !iso) return "";
    const match = rows
      .filter((r) => normalizeDateValue(r?.date) === iso)
      .filter((r) => {
        const notes = String(r?.notes || "");
        if (!/remplacement/i.test(notes)) return false;
        return notes.includes(owner) || (ownerShort && notes.includes(ownerShort));
      })
      .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))[0];
    return match ? normalizeMatricule(match.matricule || "") : "";
  };
 //tal9a des remplacants lpersonnel 3ando demande
  const getReplacementSuggestions = (requestRow) => {
    if (!requestRow) return [];
    const dateIso = normalizeDateValue(requestRow.date_preferee);
    const shiftKey = getCurrentShiftKeyForRequest(requestRow) || shiftKeyFromType(requestRow.shift_type);
    if (!dateIso || !shiftKey) return [];

    const key = `${dateIso}|${shiftKey}`;
    const busySet = busyByDateShift.get(key) || new Set();
    const restSet = restByDate.get(dateIso) || new Set();
    const requesterMatricule = normalizeMatricule(requestRow?.matricule || "");

    const requesterPlanningEntry = requesterMatricule && dateIso
      ? rows.filter(
              (row) =>
                normalizeMatricule(row?.matricule || "") === requesterMatricule &&
                normalizeDateValue(row?.date) === dateIso
            )
            .sort((a, b) =>
              String(a?.start_time || "").localeCompare(String(b?.start_time || ""))
            )[0] || null
      : null;

    const requester = personnelChoices.find(
      (p) => normalizeMatricule(p.matricule) === requesterMatricule
    );

    const toServiceId = (value) => {
      const raw = value === null || value === undefined ? "" : String(value).trim();
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };

    const requestServiceId =
      toServiceId(requestRow?.id_service) ??
      toServiceId(requesterPlanningEntry?.id_service) ??
      requester?.serviceId ??
      null;

    const requestServiceLabelRaw = String(requestRow?.service || "").trim();
    const requestServiceLabel =
      requestServiceLabelRaw && /^\d+$/.test(requestServiceLabelRaw)
        ? ""
        : requestServiceLabelRaw;

    const serviceKey = normalizeLabel(
      requestServiceLabel ||
        requesterPlanningEntry?.service ||
        requester?.serviceName ||
        ""
    );

    const requesterGradeRaw =
      requester?.grade ||
      requestRow?.grade ||
      requesterPlanningEntry?.grade ||
      "";
    const requesterGradeKey = normalizeLabel(requesterGradeRaw);
    const requesterIsGynecologue = isGynecologueGrade(requesterGradeRaw);
    const requesterIsChefService = requesterGradeKey.includes("chef de service");

    if ((!requestServiceId && !serviceKey) || !requesterGradeKey)
      return [];

    const isSameGradeStrict = (candidateGradeRaw = "") => {
      const candidateKey = normalizeLabel(candidateGradeRaw);
      return requesterGradeKey ? candidateKey === requesterGradeKey : false;
    };

    const baseFilter = (person) => {
      if (!person?.matricule) return false;
      if (normalizeMatricule(person.matricule) === requesterMatricule) return false;
      
      const personServiceId = toServiceId(person?.serviceId);
      const personServiceKey = normalizeLabel(person?.serviceName || "");
      
      if (requestServiceId) {
        if (personServiceId) {
          if (Number(personServiceId) !== Number(requestServiceId)) return false;
        } else if (serviceKey) {
          if (!personServiceKey || personServiceKey !== serviceKey) return false;
        } else {
          return false;
        }
      } else if (serviceKey) {
        if (!personServiceKey || personServiceKey !== serviceKey) return false;
      } else {
        return false;
      }
      
      if (requesterIsChefService) {
        const candidateGradeKey = normalizeLabel(person.grade || "");
        if (!candidateGradeKey.includes("surveillant")) return false;
      } else {
        if (!isSameGradeStrict(person.grade || "")) return false;
      }
      if (!requesterIsChefService && requesterIsGynecologue && !isGynecologueGrade(person.grade || "")) return false;
      
      const candidateMatricule = normalizeMatricule(person.matricule);
      if (busySet.has(candidateMatricule)) return false;//fi nafess shift
      if (restSet.has(candidateMatricule)) return false;
      
      const leaves = approvedLeaveByMatricule.get(candidateMatricule) || [];
      if (leaves.some((leave) => leave.startIso <= dateIso && leave.endIso >= dateIso)) return false;
      
      return true;
    };

    return personnelChoices.filter(baseFilter).slice(0, 5);
  };

  //    Résumé des shifts d'une personne 
  const getPersonShiftSummary = (matricule, dateIso) => {
    if (!matricule || !dateIso) return [];
    const targetMatricule = normalizeMatricule(matricule);
    return rows
      .filter(
        (row) =>
          normalizeMatricule(row.matricule || "") === targetMatricule &&
          normalizeDateValue(row.date) === dateIso
      )
      .sort((a, b) => String(a.start_time || "").localeCompare(String(b.start_time || "")))
      .map((entry) => {
        const start = entry.start_time ? entry.start_time.slice(0, 5) : "--:--";
        const end = entry.end_time ? entry.end_time.slice(0, 5) : "--:--";
        return `${start}-${end} ${entry.type || ""}`.trim();
      });
  };

  //lilbotton approuver 
  const openReplacePanel = (row) => {
    const suggestions = getReplacementSuggestions(row);
    setReplaceOpenId(row?.id ?? null);
    setReplaceSelectedMatricule(suggestions[0]?.matricule || "");
    setReplaceConfirmChecked(false);
    setRequestError("");
    setRequestSuccess("");
    setRequestSuccessTone("");
  };

  const closeReplacePanel = () => {
    if (requestBusyId) return;
    setReplaceOpenId(null);
    setReplaceSelectedMatricule("");
    setReplaceConfirmChecked(false);
  };
  //lilboutton refuser 
  const handleRefuseRequest = async (requestId) => {
    setRequestError("");
    setRequestSuccess("");
    setRequestSuccessTone("");
    try {
      await updateRequestStatus(requestId, "Refusé", {
        onSuccess: ({ requesterLabel, preferredDate, shiftLabel, statusLabel }) => {
          const tone = REQUEST_STATUS_TONES[statusLabel] || "pending";
          setRequestSuccessTone(tone);
          const base = `${requesterLabel} \u2022 ${preferredDate} \u2022 Shift ${shiftLabel}.`;
          setRequestSuccess(`Demande refusée : ${base}`);
          closeReplacePanel();
        },
        onError: (msg) => { setRequestError(msg); setTimeout(() => setRequestError(""), 4000); },
      });
    } catch (err) {
      setRequestError(err?.message || "Erreur serveur."); setTimeout(() => setRequestError(""), 4000);
    }
  };

  const handleCreateReplacement = async (row, replacementMatricule) => {
    setRequestError("");
    setRequestSuccess("");
    setRequestSuccessTone("");
    try {
      await createReplacementForRequest(row, replacementMatricule, {
        onSuccess: ({
          requesterLabel,
          dateIso,
          currentShiftLabel,
          requestedType,
          replacementName,
        }) => {
          setRequestSuccessTone("approved");
          setRequestSuccess(
            `Demande approuvée : ${requesterLabel} \u2022 ${dateIso} \u2022 ${currentShiftLabel} \u2192 ${requestedType}. Remplacement : ${replacementName}.`
          ); setTimeout(() => setRequestSuccess(""), 4000);
          closeReplacePanel();
        },
        onError: (msg) => { setRequestError(msg); setTimeout(() => setRequestError(""), 4000); },
      });
    } catch (err) {
      setRequestError(err?.message || "Erreur serveur."); setTimeout(() => setRequestError(""), 4000);
    }
  };

  return (
    <div className="modal-backdrop-soft" role="dialog" aria-modal="true" onClick={handleClose}>
      <div
        className="modal-card planning-request-modal admin-planning-request-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={handleClose} disabled={Boolean(requestBusyId)} aria-label="Fermer">
          {"\u00D7"}
        </button>

        {/* En-tête */}
        <div className="admin-conges-history-head">
          <div className="admin-conges-history-head-left">
            <span className="admin-conges-history-icon" aria-hidden="true" />
            <div>
              <div className="admin-conges-history-title">Liste Des Demandes</div>
            </div>
          </div>
        </div>

        <div className="planning-request-body">
          <div className="planning-request-toolbar admin-conges-history-toolbar">
            <div className="planning-request-filters admin-conges-history-filters">
              {/* Filtre statut */}
              <div
                className="emplois-select planning-request-status-dropdown"
                ref={requestFilterDropdownRef}
              >
                <button
                  type="button"
                  className={`form-select emplois-select-trigger ${
                    requestFilterDropdownOpen ? "open" : ""
                  }`}
                  onClick={() => {
                    setRequestFilterDropdownOpen((prev) => !prev);
                    setRequestShiftDropdownOpen(false);
                  }}
                  aria-expanded={requestFilterDropdownOpen}
                >
                  <span>{requestFilterLabel}</span>
                  <span className="emplois-select-caret" aria-hidden="true" />
                </button>
                {requestFilterDropdownOpen ? (
                  <div className="emplois-select-menu" role="listbox">
                    {REQUEST_FILTER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`emplois-select-option ${
                          requestFilter === opt.value ? "active" : ""
                        }`}
                        onClick={() => {
                          setRequestFilter(opt.value);
                          setRequestFilterDropdownOpen(false);
                        }}
                        role="option"
                        aria-selected={requestFilter === opt.value}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Filtre shift */}
              {hasShiftFilters ? (
                <div
                  className="emplois-select planning-request-status-dropdown"
                  ref={requestShiftDropdownRef}
                >
                  <button
                    type="button"
                    className={`form-select emplois-select-trigger ${
                      requestShiftDropdownOpen ? "open" : ""
                    }`}
                    onClick={() => {
                      setRequestShiftDropdownOpen((prev) => !prev);
                      setRequestFilterDropdownOpen(false);
                    }}
                    aria-expanded={requestShiftDropdownOpen}
                  >
                    <span>{requestShiftLabel}</span>
                    <span className="emplois-select-caret" aria-hidden="true" />
                  </button>
                  {requestShiftDropdownOpen ? (
                    <div className="emplois-select-menu" role="listbox">
                      {REQUEST_SHIFT_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`emplois-select-option ${
                            requestShiftFilter === opt.value ? "active" : ""
                          }`}
                          onClick={() => {
                            setRequestShiftFilter(opt.value);
                            setRequestShiftDropdownOpen(false);
                          }}
                          role="option"
                          aria-selected={requestShiftFilter === opt.value}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="admin-conges-history-reset"
              onClick={() => {
                setRequestFilter("all");
                setRequestShiftFilter("all");
                setRequestFilterDropdownOpen(false);
                setRequestShiftDropdownOpen(false);
                loadRequests();
              }}
            >
              Réinitialiser
            </button>
          </div>

          {requestError ? (
            <div className="alert alert-danger py-2 mb-3">{requestError}</div>
          ) : null}
          {requestSuccess ? (
            <div
              className={`conges-history-flash${
                requestSuccessTone ? ` tone-${requestSuccessTone}` : ""
              }`}
              role="status"
              aria-live="polite"
            >
              {requestSuccess}
            </div>
          ) : null}

          {!filteredRequests.length ? (
            <div className="planning-request-empty">Aucune demande.</div>
          ) : null}

          {/*  Liste des demandes  */}
          {filteredRequests.length ? (
            <div className="planning-request-list admin-conges-history-timeline">
              {filteredRequests.map((row) => {
                const statusLabel = normalizeRequestStatus(row.statut);
                const tone = REQUEST_STATUS_TONES[statusLabel] || "pending";
                const requesterLabel = `${row.prenom || ""} ${row.nom || ""}`.trim() || row.matricule ||"Personnel";
                const preferredDate = normalizeDateValue(row.date_preferee) || "--";
                const createdLabel = row.created_at
                  ? new Date(row.created_at).toLocaleDateString("fr-FR")
                  : "--";
                const isReplaceOpen = replaceOpenId === row.id;
                const suggestions =
                  isReplaceOpen || tone === "pending"
                    ? getReplacementSuggestions(row)
                    : [];
                const requestedShiftLabel = normalizeShiftLabel(row.shift_type) || "--";
                const currentShiftKey = getCurrentShiftKeyForRequest(row);
                const currentShiftLabel =
                  currentShiftKey === "apres-midi"
                    ? "Apres-midi"
                    : currentShiftKey === "garde"
                    ? "Garde"
                    : "Matin";

                // Remplaçant approuvé
                let approvedReplacementMatricule = String(
                  row?.replacement_matricule || ""
                ).trim();
                if (!approvedReplacementMatricule && tone === "approved") {
                  approvedReplacementMatricule = findReplacementMatriculeFromPlanning(
                    row?.matricule,
                    preferredDate
                  );
                }
                const approvedReplacementPerson = approvedReplacementMatricule
                  ? personnelChoices.find(
                      (p) =>
                        normalizeMatricule(p?.matricule || "") ===
                        normalizeMatricule(approvedReplacementMatricule)
                    )
                  : null;
                const approvedReplacementLabel =
                  approvedReplacementPerson?.name || approvedReplacementMatricule || "";

                return (
                  <div
                    key={row.id}
                    id={`admin-planning-request-${row.id}`}
                    className="admin-conges-history-item"
                  >
                    <div className="admin-conges-history-dot-wrap" aria-hidden="true">
                      <span className={`admin-conges-history-dot tone-${tone}`} />
                    </div>
                    <div
                      className={`admin-conges-history-card ${tone} ${
                        isReplaceOpen ? "replace-open" : ""
                      }`}
                    >
                      {/*  Panneau de remplacement  */}
                      {isReplaceOpen ? (
                        <div className="planning-replace-inline replace-full">
                          <div className="planning-replace-header">
                            <div className="planning-replace-title">Remplacement</div>
                            <div className="planning-replace-sub">{requesterLabel}</div>
                          </div>

                          <div className="planning-replace-summary">
                            <div className="planning-replace-row">
                              <span className="text-muted">Demande :</span>
                              <span>
                                {row.matricule || "--"} – {preferredDate} – Shift demandé{" "}
                                {requestedShiftLabel}
                              </span>
                            </div>
                            <div className="planning-replace-row">
                              <span className="text-muted">Shift actuel :</span>
                              <span>{currentShiftLabel}</span>
                            </div>
                            {row.service ? (
                              <div className="planning-replace-row">
                                <span className="text-muted">Service :</span>
                                <span>{row.service}</span>
                              </div>
                            ) : null}
                          </div>

                          <div className="planning-replace-list">
                            {suggestions.map((person) => {
                              const shifts = getPersonShiftSummary(
                                person.matricule,
                                preferredDate
                              );
                              return (
                                <label
                                  key={`${row.id}-${person.matricule}`}
                                  className={`planning-replace-option ${
                                    replaceSelectedMatricule === person.matricule
                                      ? "active"
                                      : ""
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`replace-candidate-${row.id}`}
                                    value={person.matricule}
                                    checked={replaceSelectedMatricule === person.matricule}
                                    onChange={() =>
                                      setReplaceSelectedMatricule(person.matricule)
                                    }
                                  />
                                  <div>
                                    <div className="planning-replace-name">
                                      {person.name || person.matricule}
                                    </div>
                                    <div className="planning-replace-meta">
                                      {person.grade ? (
                                        <span>Grade : {person.grade}</span>
                                      ) : null}
                                      <span>Matricule : {person.matricule}</span>
                                    </div>
                                    <div className="planning-replace-shifts">
                                      <span className="planning-replace-shifts-label">
                                        Shifts du jour :
                                      </span>
                                      {shifts.length ? (
                                        shifts.map((label) => (
                                          <span
                                            key={`${person.matricule}-${label}`}
                                            className="planning-replace-shift-chip"
                                          >
                                            {label}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-muted">Aucun shift</span>
                                      )}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>

                          {!suggestions.length ? (
                            <div className="text-muted">Aucun remplaçant disponible.</div>
                          ) : null}

                          <label className="planning-replace-confirm">
                            <input
                              type="checkbox"
                              checked={replaceConfirmChecked}
                              onChange={(e) => setReplaceConfirmChecked(e.target.checked)}
                            />
                            Je confirme la création du remplacement.
                          </label>

                          <div className="planning-replace-inline-actions">
                            <button
                              type="button"
                              className="btn emplois-btn-secondary"
                              onClick={closeReplacePanel}
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              className="btn emplois-btn-primary"
                              disabled={
                                !replaceConfirmChecked ||
                                !replaceSelectedMatricule ||
                                requestBusyId === row.id
                              }
                              onClick={() =>
                                handleCreateReplacement(row, replaceSelectedMatricule)
                              }
                            >
                              {requestBusyId === row.id ? "..." : "Approuver et remplacer"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Carte normale  */
                        <>
                          <div className="planning-request-header">
                            <div>
                              <div className="admin-conges-history-name">
                                {requesterLabel}
                              </div>
                              <div className="admin-conges-history-submitted">
                                Soumis le {createdLabel}
                              </div>
                            </div>
                            <span className={`admin-conges-history-status tone-${tone}`}>
                              {statusLabel}
                            </span>
                          </div>

                          <div className="admin-conges-history-mainline">
                            <strong>{preferredDate}</strong>{" "}
                            <span className="admin-conges-history-period">
                              – Shift demandé <strong>{requestedShiftLabel}</strong>
                              {row.service ? (
                                <>
                                  {" "}
                                  – <strong>{row.service}</strong>
                                </>
                              ) : null}
                            </span>
                          </div>

                          <div className="admin-conges-history-motif">
                            Raison : {row.raison || "-"}
                          </div>

                          <div className="admin-conges-history-tags">
                            {row.service ? (
                              <span className="admin-conges-tag">{row.service}</span>
                            ) : null}
                            <span className="admin-conges-tag">
                              Matricule : {row.matricule || "--"}
                            </span>
                          </div>

                          <div className="admin-conges-history-tags">
                            {tone === "pending" ? (
                              <>
                                <span className="planning-request-replacements-label">
                                  Remplaçants possibles :
                                </span>
                                {suggestions.length ? (
                                  suggestions.map((person) => (
                                    <span
                                      key={`${row.id}-${person.matricule}`}
                                      className="admin-conges-tag"
                                    >
                                      {person.name || person.matricule}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-muted">Aucun disponible</span>
                                )}
                              </>
                            ) : tone === "approved" ? (
                              <>
                                <span className="planning-request-replacements-label">
                                  Remplaçant :
                                </span>
                                {approvedReplacementLabel ? (
                                  <span className="admin-conges-tag">
                                    {approvedReplacementLabel}
                                  </span>
                                ) : (
                                  <span className="text-muted">Non défini</span>
                                )}
                              </>
                            ) : null}
                          </div>

                          {statusLabel === "En attente" ? (
                            <div className="admin-conges-history-actions">
                              <button
                                type="button"
                                className="admin-conges-history-btn approve"
                                onClick={() => openReplacePanel(row)}
                                disabled={requestBusyId === row.id}
                              >
                                {requestBusyId === row.id ? "..." : "Approuver"}
                              </button>
                              <button
                                type="button"
                                className="admin-conges-history-btn refuse"
                                onClick={() =>
                                  handleRefuseRequest(row.id)
                                }
                                disabled={requestBusyId === row.id}
                              >
                                Refuser
                              </button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}