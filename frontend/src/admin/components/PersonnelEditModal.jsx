import { useEffect, useMemo, useRef, useState } from "react";

const normalizeNameInput = (value = "") => {
  const compact = value.toString().replace(/\s+/g, " ").replace(/^\s+/, "");
  if (!compact) return "";
  return compact.charAt(0).toUpperCase() + compact.slice(1);
};

const getInitials = (name = "") =>
  String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

export default function PersonnelEditModal(props) {
  if (!props.open) return null;
  return <PersonnelEditModalInner {...props} />;
}

function PersonnelEditModalInner({
  onClose,
  onSubmit,
  form,
  setForm,
  formErrors,
  roleOptions,
  onRoleChange,
  gradesLoading,
  availableGrades,
  onGradeChange,
  forcedService,
  forcedServiceInfo,
  serviceOptionsForForm,
  contractOptions,
  isEditCddLocked,
  forcedContract,
  allowedContractTypes,
  getContractTypeKey,
  contractPolicy,
  todayISO,
  saving,
}) {
  const gradeDropdownRef = useRef(null);
  const serviceDropdownRef = useRef(null);
  const [gradeDropdownOpen, setGradeDropdownOpen] = useState(false);
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(false);

  const matriculeRef = useRef(null);
  const prenomRef = useRef(null);
  const nomRef = useRef(null);
  const emailRef = useRef(null);
  const cinRef = useRef(null);
  const hireDateRef = useRef(null);
  const gradeRef = useRef(null);
  const contractRef = useRef(null);
  const serviceRef = useRef(null);
  const phoneRef = useRef(null);
  const adresseRef = useRef(null);

  const displayName = useMemo(() => {
    const prenom = String(form?.prenom || "").trim();
    const nom = String(form?.nom || "").trim();
    return [prenom, nom].filter(Boolean).join(" ").trim();
  }, [form?.prenom, form?.nom]);

  const selectedGradeValue = String(form?.gradeId ?? form?.grade ?? "");

  const selectedGradeLabel = (() => {
    if (gradesLoading) return "Chargement...";
    if (!availableGrades?.length) return "Aucun grade disponible";
    const selected = availableGrades.find(
      (g) =>
        String(g?.id ?? g?.label) === selectedGradeValue || String(g?.label) === String(form?.grade || "")
    );
    return selected?.label || form?.grade || "Sélectionner un grade";
  })();

  const selectedServiceLabel = (() => {
    if (form?.service) return form.service;
    if (serviceOptionsForForm?.length) return serviceOptionsForForm[0] || "Sélectionner un service";
    return "Aucun service disponible";
  })();

  useEffect(() => {
    const keys = formErrors ? Object.keys(formErrors) : [];
    const firstErrKey = keys.find((key) => formErrors?.[key]);
    if (!firstErrKey) return;

    const ref = (() => {
      if (firstErrKey === "matricule") return matriculeRef;
      if (firstErrKey === "prenom") return prenomRef;
      if (firstErrKey === "nom") return nomRef;
      if (firstErrKey === "email") return emailRef;
      if (firstErrKey === "cin") return cinRef;
      if (firstErrKey === "hireDate") return hireDateRef;
      if (firstErrKey === "grade") return gradeRef;
      if (firstErrKey === "contract") return contractRef;
      if (firstErrKey === "service") return serviceRef;
      if (firstErrKey === "phone") return phoneRef;
      if (firstErrKey === "adresse") return adresseRef;
      return null;
    })();

    if (!ref?.current) return;
    ref.current.focus?.();
    ref.current.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [formErrors]);

  const isServiceDropdownOpen = Boolean(serviceDropdownOpen && !forcedService);

  useEffect(() => {
    if (!gradeDropdownOpen && !isServiceDropdownOpen) return undefined;
    const handleClickOutside = (event) => {
      const insideGrade = gradeDropdownRef.current && gradeDropdownRef.current.contains(event.target);
      const insideService = serviceDropdownRef.current && serviceDropdownRef.current.contains(event.target);
      if (insideGrade || insideService) return;
      setGradeDropdownOpen(false);
      setServiceDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [gradeDropdownOpen, isServiceDropdownOpen]);

  return (
    <div className="modal-backdrop-soft" onClick={onClose}>
      <div className="modal-card personnel-edit-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <div className="service-edit-header">
          <span className="service-edit-icon" aria-hidden="true" />
          <div className="service-edit-title">Modifier Personnel</div>
        </div>

        <form className="modal-body-scroll" onSubmit={onSubmit} noValidate>
          <div className="subsection-title">Modifier Personnel</div>
          {formErrors.general ? <div className="alert alert-danger py-2 mb-3">{formErrors.general}</div> : null}
          <div className="profile-grid mb-3">
            <div className="profile-card">
              <div className="avatar-hero">{getInitials(displayName || "N P") || "?"}</div>
              <div className="small text-muted mt-3">CIN</div>
              <div className="fw-semibold">{form.cin || "—"}</div>
              <div className="badge-soft blue mt-3 w-100 text-center">Matricule {form.matricule || "—"}</div>
            </div>

            <div className="profile-main">
              <div className="profile-name-heading">{displayName || "Personnel"}</div>
              <div className="text-muted small mb-3">Mettez à jour les informations du personnel.</div>

              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label">Nom *</label>
                  <input
                    ref={nomRef}
                    className="form-control form-control-sm"
                    placeholder="Ex: Ben Ali"
                    value={form.nom}
                    onChange={(e) => setForm({ ...form, nom: normalizeNameInput(e.target.value.replace(/\d/g, "")) })}
                  />
                  {formErrors.nom ? <div className="text-danger small mt-1">{formErrors.nom}</div> : null}
                </div>
                <div className="col-md-6">
                  <label className="form-label">Prénom *</label>
                  <input
                    ref={prenomRef}
                    className="form-control form-control-sm"
                    placeholder="Ex: Ahmed"
                    value={form.prenom}
                    onChange={(e) =>
                      setForm({ ...form, prenom: normalizeNameInput(e.target.value.replace(/\d/g, "")) })
                    }
                  />
                  {formErrors.prenom ? <div className="text-danger small mt-1">{formErrors.prenom}</div> : null}
                </div>

                <div className="col-md-6">
                  <label className="form-label">Numéro CIN *</label>
                  <input
                    ref={cinRef}
                    type="text"
                    inputMode="numeric"
                    className="form-control form-control-sm"
                    placeholder="8 chiffres"
                    maxLength={8}
                    value={form.cin}
                    disabled
                    onChange={(e) => setForm({ ...form, cin: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                    onKeyDown={(e) => e.preventDefault()}
                    onPaste={(e) => e.preventDefault()}
                  />
                  {formErrors.cin ? <div className="text-danger small mt-1">{formErrors.cin}</div> : null}
                </div>

                <div className="col-md-6">
                  <label className="form-label">Matricule *</label>
                  <input
                    ref={matriculeRef}
                    type="text"
                    inputMode="numeric"
                    className="form-control form-control-sm"
                    placeholder="10 chiffres"
                    maxLength={10}
                    value={form.matricule}
                    disabled
                    onChange={(e) => setForm({ ...form, matricule: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    onKeyDown={(e) => e.preventDefault()}
                    onPaste={(e) => e.preventDefault()}
                  />
                  {formErrors.matricule ? <div className="text-danger small mt-1">{formErrors.matricule}</div> : null}
                </div>

                <div className="col-md-6">
                  <label className="form-label">Rôle *</label>
                  <div className="d-flex flex-wrap gap-2">
                    {roleOptions.map((opt) => {
                      const isActive = form.roleCategory === opt.key;
                      const tone = opt.key === "medecin" ? "med" : opt.key === "infirmier" ? "inf" : "param";
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          className={`pill-choice ${isActive ? "active " + tone : ""}`}
                          disabled
                          onClick={() => onRoleChange(opt.key)}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="col-md-6">
                  <label className="form-label">Grade *</label>
                  <div className="emplois-select personnel-grade-dropdown" ref={gradeDropdownRef}>
                    <button
                      ref={gradeRef}
                      type="button"
                      className={`form-select emplois-select-trigger personnel-grade-trigger ${
                        gradeDropdownOpen ? "open" : ""
                      }`}
                      disabled={form.roleCategory === "paramedical"}
                      onClick={() =>
                        setGradeDropdownOpen((prev) => {
                          if (form.roleCategory === "paramedical") return false;
                          const next = !prev;
                          if (next) setServiceDropdownOpen(false);
                          return next;
                        })
                      }
                      aria-expanded={gradeDropdownOpen}
                      aria-haspopup="listbox"
                    >
                      <span>{selectedGradeLabel}</span>
                      <span className="emplois-select-caret" aria-hidden="true" />
                    </button>
                    {gradeDropdownOpen ? (
                      <div className="emplois-select-menu personnel-grade-menu" role="listbox">
                        {gradesLoading ? (
                          <button className="emplois-select-option disabled" disabled>
                            Chargement...
                          </button>
                        ) : null}
                        {!gradesLoading && !availableGrades.length ? (
                          <button className="emplois-select-option disabled" disabled>
                            Aucun grade disponible
                          </button>
                        ) : null}
                        {!gradesLoading
                          ? availableGrades.map((g, idx) => {
                              const value = String(g.id ?? g.label);
                              return (
                                <button
                                  key={`${g.label}-${g.id ?? idx}`}
                                  type="button"
                                  className={`emplois-select-option ${value === selectedGradeValue ? "active" : ""}`}
                                  onClick={() => {
                                    onGradeChange(value);
                                    setGradeDropdownOpen(false);
                                  }}
                                  role="option"
                                  aria-selected={value === selectedGradeValue}
                                >
                                  {g.label}
                                </button>
                              );
                            })
                          : null}
                      </div>
                    ) : null}
                  </div>
                  {formErrors.grade ? <div className="text-danger small mt-1">{formErrors.grade}</div> : null}
                </div>

                <div className="col-md-6">
                  <label className="form-label">Date d'Embauche *</label>
                  <input
                    ref={hireDateRef}
                    type="date"
                    className="form-control form-control-sm"
                    value={form.hireDate}
                    disabled
                    max={todayISO()}
                    onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
                  />
                  {formErrors.hireDate ? <div className="text-danger small mt-1">{formErrors.hireDate}</div> : null}
                </div>

                <div className="col-md-6">
                  <label className="form-label">Service Affecté *</label>
                  <div className="emplois-select personnel-service-dropdown" ref={serviceDropdownRef}>
                    <button
                      ref={serviceRef}
                      type="button"
                      className={`form-select emplois-select-trigger personnel-service-trigger ${
                        isServiceDropdownOpen ? "open" : ""
                      }`}
                      disabled={Boolean(forcedService)}
                      onClick={() =>
                        setServiceDropdownOpen((prev) => {
                          if (forcedService) return false;
                          const next = !prev;
                          if (next) setGradeDropdownOpen(false);
                          return next;
                        })
                      }
                      aria-expanded={isServiceDropdownOpen}
                      aria-haspopup="listbox"
                    >
                      <span>{selectedServiceLabel}</span>
                      <span className="emplois-select-caret" aria-hidden="true" />
                    </button>
                    {isServiceDropdownOpen ? (
                      <div className="emplois-select-menu personnel-service-menu" role="listbox">
                        {(serviceOptionsForForm.length ? serviceOptionsForForm : [""]).map((s, idx) => {
                          const value = String(s || "");
                          const isSelected = value === String(form.service || "");
                          return (
                            <button
                              key={`${s || "empty"}-${idx}`}
                              type="button"
                              className={`emplois-select-option ${isSelected ? "active" : ""}`}
                              onClick={() => {
                                setForm((prev) => ({ ...prev, service: value }));
                                setServiceDropdownOpen(false);
                              }}
                              role="option"
                              aria-selected={isSelected}
                            >
                              {s || "Sélectionner un service"}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  {formErrors.service ? <div className="text-danger small mt-1">{formErrors.service}</div> : null}
                  {forcedService ? (
                    <div className="text-muted small mt-1">Service impose par le grade : {forcedService}</div>
                  ) : null}
                  {!forcedService && forcedServiceInfo.shouldForce ? (
                    <div className="text-warning small mt-1">
                      Service attendu ({forcedServiceInfo.expectedService}) introuvable dans la base.
                    </div>
                  ) : null}
                </div>

                <div className="col-md-6">
                  <label className="form-label">Type de Contrat *</label>
                  <div className="d-flex flex-wrap gap-3">
                    {contractOptions.map((c, idx) => (
                      <label key={c} className="contract-pill">
                        <input
                          ref={idx === 0 ? contractRef : null}
                          type="radio"
                          name="contract"
                          value={c}
                          checked={form.contract === c}
                          disabled={
                            isEditCddLocked ||
                            (Boolean(forcedContract) && c !== forcedContract) ||
                            (allowedContractTypes.length && !allowedContractTypes.includes(getContractTypeKey(c)))
                          }
                          onChange={(e) => {
                            if (
                              isEditCddLocked ||
                              (forcedContract && c !== forcedContract) ||
                              (allowedContractTypes.length &&
                                !allowedContractTypes.includes(getContractTypeKey(c)))
                            ) {
                              return;
                            }
                            setForm({ ...form, contract: e.target.value });
                          }}
                        />
                        <span>{c}</span>
                      </label>
                    ))}
                  </div>
                  {isEditCddLocked ? (
                    <div className="text-muted small mt-1">Contrat CDD fixe en modification.</div>
                  ) : null}
                  {contractPolicy.hint ? <div className="text-muted small mt-1">{contractPolicy.hint}</div> : null}
                  {formErrors.contract ? <div className="text-danger small mt-1">{formErrors.contract}</div> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="subsection-title">Contact</div>
          <div className="row g-3 mb-2">
            <div className="col-md-6">
              <label className="form-label">Email *</label>
              <input
                ref={emailRef}
                className="form-control form-control-sm"
                placeholder="exemple@domaine.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              {formErrors.email ? <div className="text-danger small mt-1">{formErrors.email}</div> : null}
            </div>
            <div className="col-md-6">
              <label className="form-label">Téléphone *</label>
              <input
                ref={phoneRef}
                type="text"
                inputMode="numeric"
                className="form-control form-control-sm"
                placeholder="8 chiffres"
                maxLength={8}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                onKeyDown={(e) => {
                  const allowed = ["Backspace", "Tab", "ArrowLeft", "ArrowRight", "Delete", "Home", "End"];
                  if (!/[0-9]/.test(e.key) && !allowed.includes(e.key)) e.preventDefault();
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 8);
                  setForm((prev) => ({ ...prev, phone: digits }));
                }}
              />
              {formErrors.phone ? <div className="text-danger small mt-1">{formErrors.phone}</div> : null}
            </div>
            <div className="col-12">
              <label className="form-label">Adresse *</label>
              <input
                ref={adresseRef}
                className="form-control form-control-sm"
                placeholder="Adresse"
                value={form.adresse}
                onChange={(e) => setForm({ ...form, adresse: e.target.value })}
              />
              {formErrors.adresse ? <div className="text-danger small mt-1">{formErrors.adresse}</div> : null}
            </div>
          </div>

          <div className="service-edit-actions">
            <button className="btn service-edit-cancel-btn" onClick={onClose} disabled={saving}>
              Annuler
            </button>
            <button type="submit" className="btn service-edit-save-btn" disabled={saving}>
              <span className="service-edit-save-icon" aria-hidden="true" />
              {saving ? "Sauvegarde..." : "Sauvegarder"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}