const storageKey = "workoutTrackerData";
const themeKey = "workoutTrackerTheme";
const weekNamesKey = "workoutTrackerWeekNames";

const form = document.getElementById("workout-form");
const workoutIdInput = document.getElementById("workout-id");
const workoutNameInput = document.getElementById("workout-name");
const dateInput = document.getElementById("date");
const notesInput = document.getElementById("notes");
const exerciseNameInput = document.getElementById("exercise-name");
const exerciseSetsInput = document.getElementById("exercise-sets");
const exerciseRepsInput = document.getElementById("exercise-reps");
const exerciseWeightInput = document.getElementById("exercise-weight");
const exerciseListContainer = document.getElementById("exercise-list");
const exerciseSubmitBtn = document.getElementById("add-exercise-btn");
const exerciseSuggestions = document.getElementById("exercise-suggestions");
const progressionHint = document.getElementById("progression-hint");
const listContainer = document.getElementById("workout-list");
const resetBtn = document.getElementById("reset-btn");
const clearStorageBtn = document.getElementById("clear-storage-btn");
const weekFilter = document.getElementById("week-filter");
const themeToggle = document.getElementById("theme-toggle");
const weekLabelWrapper = document.getElementById("week-label");
const weekLabelText = document.getElementById("week-label-text");
const weekLabelInput = document.getElementById("week-label-input");
const copyWorkoutBtn = document.getElementById("copy-workout-btn");
const historyPlaceholderOption =
    exerciseSuggestions?.querySelector('option[data-placeholder="true"]')?.outerHTML || "";
const saveButton = form.querySelector(".primary-btn");
const PROGRESSION_WEIGHT_STEP = 2.5;

let exerciseBuffer = [];
let currentWeekFilter = null;
let customWeekNames = {};
let editingExerciseId = null;
let exerciseHistoryMap = new Map();
let recommendationNames = [];

function setExerciseFormMode(isEditing) {
    if (!exerciseSubmitBtn) return;
    exerciseSubmitBtn.textContent = isEditing ? "Update Exercise" : "Add Exercise";
}

function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (char) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };
        return entities[char] || char;
    });
}

function updateWeekDisplay() {
    if (!weekLabelWrapper || !weekLabelText) return;
    const info = getWeekInfo(dateInput.value);
    if (!info) {
        weekLabelWrapper.classList.add("disabled");
        weekLabelText.textContent = "Select a date to name this week";
        if (weekLabelInput) {
            weekLabelInput.value = "";
        }
        return;
    }
    weekLabelWrapper.classList.remove("disabled");
    const label = getWeekLabel(info.key, info.label);
    weekLabelText.textContent = label;
    if (weekLabelInput) {
        weekLabelInput.value = label;
    }
}

function beginWeekLabelEdit() {
    if (
        !weekLabelWrapper ||
        !weekLabelInput ||
        weekLabelWrapper.classList.contains("disabled")
    )
        return;
    weekLabelWrapper.classList.add("editing");
    weekLabelInput.focus();
    weekLabelInput.select();
}

function finishWeekLabelEdit(apply) {
    if (!weekLabelWrapper || !weekLabelInput) return;
    weekLabelWrapper.classList.remove("editing");
    const info = getWeekInfo(dateInput.value);
    if (!info) return;
    if (apply) {
        const trimmed = weekLabelInput.value.trim();
        if (trimmed) {
            customWeekNames[info.key] = trimmed;
        } else {
            delete customWeekNames[info.key];
        }
        saveWeekNames();
        renderWorkouts();
    }
    updateWeekDisplay();
}

function updateExerciseSuggestions(filterText = "") {
    if (!exerciseSuggestions) return;
    const normalizedFilter = filterText.trim().toLowerCase();
    const matches = recommendationNames.filter((name) =>
        !normalizedFilter
            ? true
            : name.toLowerCase().includes(normalizedFilter)
    );
    const limited = matches.slice(0, 5);
    const options = limited
        .map((rawName) => {
            const actualName = typeof rawName === "string" ? rawName : "";
            const safeName = escapeHtml(actualName);
            const encoded = encodeURIComponent(actualName);
            return `<option value="${encoded}">${safeName}</option>`;
        })
        .join("");
    exerciseSuggestions.innerHTML = `${historyPlaceholderOption}${options}`;
    exerciseSuggestions.value = "";
}

function updateProgressionHint(name) {
    if (!progressionHint) return;
    const key = name.trim().toLowerCase();
    if (!key || !exerciseHistoryMap.has(key)) {
        progressionHint.textContent = "";
        return;
    }
    const last = exerciseHistoryMap.get(key);
    let hint = "";
    if (last.weight && last.weight > 0) {
        const suggestion = Math.round((last.weight + PROGRESSION_WEIGHT_STEP) * 10) / 10;
        hint = `Last session: ${last.weight} kg. Try around ${suggestion} kg.`;
    } else if (last.reps && last.reps > 0) {
        hint = `Last session: ${last.reps} reps. Try ${last.reps + 1} reps.`;
    }
    progressionHint.textContent = hint;
}

/**
 * Retrieve saved workouts from localStorage and normalize legacy entries.
 */
function getWorkouts() {
    const saved = localStorage.getItem(storageKey);
    if (!saved) {
        return [];
    }

    try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed.map(normalizeWorkout).filter(Boolean) : [];
    } catch (_error) {
        return [];
    }
}

/**
 * Ensure the workout shape always matches the latest data model.
 */
function normalizeWorkout(workout) {
    if (!workout) {
        return null;
    }

    const normalized = {
        id: workout.id || crypto.randomUUID(),
        name: workout.name || workout.exercise || "Workout",
        date: workout.date || new Date().toISOString().split("T")[0],
        notes: workout.notes || "",
        exercises: Array.isArray(workout.exercises)
            ? workout.exercises
            : [
                  {
                      id: crypto.randomUUID(),
                      name: workout.exercise || "Exercise",
                      sets: Number(workout.sets) || 0,
                      reps: Number(workout.reps) || 0,
                      weight: Number(workout.weight) || 0
                  }
              ],
        updatedAt: workout.updatedAt || Date.now()
    };

    normalized.exercises = normalized.exercises.map((exercise) => ({
        id: exercise.id || crypto.randomUUID(),
        name: exercise.name || "Exercise",
        sets: Number(exercise.sets) || 0,
        reps: Number(exercise.reps) || 0,
        weight: Number(exercise.weight) || 0
    }));

    return normalized;
}

/**
 * Persist the provided workouts array.
 */
function setWorkouts(workouts) {
    localStorage.setItem(storageKey, JSON.stringify(workouts));
}

/**
 * Persist theme preference and reflect it in the UI.
 */
function applyTheme(theme) {
    document.body.dataset.theme = theme;
    localStorage.setItem(themeKey, theme);
    updateThemeToggleLabel(theme);
}

function initTheme() {
    const savedTheme = localStorage.getItem(themeKey) || "dark";
    document.body.dataset.theme = savedTheme;
    updateThemeToggleLabel(savedTheme);
}

function loadWeekNames() {
    const saved = localStorage.getItem(weekNamesKey);
    if (!saved) {
        customWeekNames = {};
        return;
    }
    try {
        const parsed = JSON.parse(saved);
        customWeekNames = parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
        customWeekNames = {};
    }
}

function saveWeekNames() {
    localStorage.setItem(weekNamesKey, JSON.stringify(customWeekNames));
}

function updateThemeToggleLabel(currentTheme) {
    if (!themeToggle) return;
    themeToggle.textContent =
        currentTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode";
}

/**
 * Create a workout object from the form values and current exercise buffer.
 */
function buildWorkoutFromForm() {
    return {
        id: workoutIdInput.value || crypto.randomUUID(),
        name: workoutNameInput.value.trim(),
        date: dateInput.value,
        notes: notesInput.value.trim(),
        exercises: exerciseBuffer.map((exercise) => ({ ...exercise })),
        updatedAt: Date.now()
    };
}

/**
 * Reset the workout form to its default state.
 */
function resetForm() {
    form.reset();
    workoutIdInput.value = "";
    exerciseBuffer = [];
    editingExerciseId = null;
    renderExerciseList();
    saveButton.textContent = "Save Workout";
    resetExerciseInputs();
    updateWeekDisplay();
}

/**
 * Render the in-progress list of exercises.
 */
function renderExerciseList() {
    if (!exerciseBuffer.length) {
        exerciseListContainer.innerHTML = `<p class="placeholder small">No exercises added yet.</p>`;
        return;
    }

    const list = document.createElement("ul");
    list.className = "exercise-items";

    exerciseBuffer.forEach((exercise, index) => {
        const item = document.createElement("li");
        item.className = "exercise-item";

        const detailWrapper = document.createElement("div");
        detailWrapper.className = "exercise-item-details";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = exercise.name;

        const metaSpan = document.createElement("small");
        metaSpan.textContent = `${exercise.sets} sets x ${exercise.reps} reps @ ${exercise.weight} kg`;

        detailWrapper.appendChild(nameSpan);
        detailWrapper.appendChild(metaSpan);

        const actionBar = document.createElement("div");
        actionBar.className = "exercise-item-actions";

        const moveUpBtn = document.createElement("button");
        moveUpBtn.type = "button";
        moveUpBtn.className = "secondary-btn ghost-btn";
        moveUpBtn.dataset.exerciseId = exercise.id;
        moveUpBtn.dataset.action = "move-up";
        moveUpBtn.textContent = "Up";

        const moveDownBtn = document.createElement("button");
        moveDownBtn.type = "button";
        moveDownBtn.className = "secondary-btn ghost-btn";
        moveDownBtn.dataset.exerciseId = exercise.id;
        moveDownBtn.dataset.action = "move-down";
        moveDownBtn.textContent = "Down";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "secondary-btn";
        editBtn.dataset.exerciseId = exercise.id;
        editBtn.dataset.action = "edit";
        editBtn.textContent = "Edit";

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "secondary-btn";
        removeBtn.dataset.exerciseId = exercise.id;
        removeBtn.dataset.action = "remove";
        removeBtn.textContent = "Remove";

        moveUpBtn.disabled = index === 0;
        moveDownBtn.disabled = index === exerciseBuffer.length - 1;

        actionBar.appendChild(moveUpBtn);
        actionBar.appendChild(moveDownBtn);
        actionBar.appendChild(editBtn);
        actionBar.appendChild(removeBtn);

        item.appendChild(detailWrapper);
        item.appendChild(actionBar);
        list.appendChild(item);
    });

    exerciseListContainer.innerHTML = "";
    exerciseListContainer.appendChild(list);
}

function resetExerciseInputs() {
    exerciseNameInput.value = "";
    exerciseSetsInput.value = "";
    exerciseRepsInput.value = "";
    exerciseWeightInput.value = "";
    editingExerciseId = null;
    setExerciseFormMode(false);
    exerciseNameInput.focus();
    updateExerciseSuggestions("");
    updateProgressionHint("");
}

function addExerciseToBuffer() {
    const name = exerciseNameInput.value.trim();
    const sets = Number(exerciseSetsInput.value);
    const reps = Number(exerciseRepsInput.value);
    const weight = Number(exerciseWeightInput.value);

    if (!name || !Number.isFinite(sets) || !Number.isFinite(reps) || sets <= 0 || reps <= 0) {
        alert("Enter a valid exercise with sets and reps greater than zero.");
        return;
    }

    if (!Number.isFinite(weight) || weight < 0) {
        alert("Weight must be zero or a positive number.");
        return;
    }

    if (editingExerciseId) {
        const index = exerciseBuffer.findIndex((exercise) => exercise.id === editingExerciseId);
        if (index >= 0) {
            exerciseBuffer[index] = {
                ...exerciseBuffer[index],
                name,
                sets,
                reps,
                weight
            };
        }
    } else {
        exerciseBuffer.push({
            id: crypto.randomUUID(),
            name,
            sets,
            reps,
            weight
        });
    }

    renderExerciseList();
    resetExerciseInputs();
}

function removeExerciseFromBuffer(id) {
    exerciseBuffer = exerciseBuffer.filter((exercise) => exercise.id !== id);
    if (editingExerciseId === id) {
        resetExerciseInputs();
    }
    renderExerciseList();
}

function beginExerciseEdit(id) {
    const exercise = exerciseBuffer.find((item) => item.id === id);
    if (!exercise) {
        return;
    }
    editingExerciseId = id;
    exerciseNameInput.value = exercise.name;
    exerciseSetsInput.value = exercise.sets;
    exerciseRepsInput.value = exercise.reps;
    exerciseWeightInput.value = exercise.weight;
    setExerciseFormMode(true);
    exerciseNameInput.focus();
    updateProgressionHint(exercise.name);
}

function handleExerciseNameInput() {
    const value = exerciseNameInput.value;
    updateExerciseSuggestions(value);
    updateProgressionHint(value);
}

function moveExercise(id, direction) {
    const index = exerciseBuffer.findIndex((exercise) => exercise.id === id);
    if (index < 0) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= exerciseBuffer.length) return;
    const temp = exerciseBuffer[index];
    exerciseBuffer[index] = exerciseBuffer[targetIndex];
    exerciseBuffer[targetIndex] = temp;
    renderExerciseList();
}

function copyPreviousWorkout() {
    const workouts = getWorkouts().filter(Boolean);
    if (!workouts.length) {
        alert("No saved workouts to copy yet.");
        return;
    }
    const source = [...workouts].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    workoutNameInput.value = source.name ? `${source.name} (Copy)` : "";
    notesInput.value = source.notes || "";
    exerciseBuffer = source.exercises.map((exercise) => ({
        id: crypto.randomUUID(),
        name: exercise.name,
        sets: exercise.sets,
        reps: exercise.reps,
        weight: exercise.weight
    }));
    renderExerciseList();
    resetExerciseInputs();
    const today = new Date().toISOString().split("T")[0];
    dateInput.value = today;
    updateWeekDisplay();
}

/**
 * Compute ISO week and grouping metadata for the provided date string.
 */
function getWeekInfo(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNumber = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);

    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const weekNumber = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);

    const weekStart = new Date(utcDate);
    weekStart.setUTCDate(utcDate.getUTCDate() - 3);

    return {
        key: `${utcDate.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`,
        label: `Week ${weekNumber}, ${utcDate.getUTCFullYear()}`,
        sortValue: weekStart.getTime()
    };
}

function groupWorkoutsByWeek(workouts) {
    const groups = new Map();

    workouts.forEach((workout) => {
        const info = getWeekInfo(workout.date);
        if (!info) return;

        if (!groups.has(info.key)) {
            groups.set(info.key, {
                key: info.key,
                label: info.label,
                sortValue: info.sortValue,
                workouts: []
            });
        }

        groups.get(info.key).workouts.push(workout);
    });

    return Array.from(groups.values()).sort((a, b) => b.sortValue - a.sortValue);
}

function refreshExerciseHistory(workouts) {
    exerciseHistoryMap = new Map();
    const seen = new Set();
    const names = [];
    const sorted = [...workouts].sort((a, b) => b.updatedAt - a.updatedAt);
    sorted.forEach((workout) => {
        workout.exercises.forEach((exercise) => {
            const key = (exercise.name || "").trim().toLowerCase();
            if (!key || seen.has(key)) return;
            seen.add(key);
            exerciseHistoryMap.set(key, {
                name: exercise.name,
                weight: Number(exercise.weight) || 0,
                reps: Number(exercise.reps) || 0
            });
            names.push(exercise.name);
        });
    });
    recommendationNames = names;
    const currentValue = exerciseNameInput ? exerciseNameInput.value : "";
    updateExerciseSuggestions(currentValue);
    updateProgressionHint(currentValue);
}

function getWeekLabel(key, fallback) {
    const stored = customWeekNames[key];
    if (stored && stored.trim()) {
        return stored.trim();
    }
    return fallback;
}

function populateWeekFilter(groups) {
    if (!weekFilter) return;

    if (!groups.length) {
        weekFilter.innerHTML = `<option value="">No weeks yet</option>`;
        weekFilter.disabled = true;
        currentWeekFilter = null;
        return;
    }

    weekFilter.disabled = false;
    weekFilter.innerHTML = groups
        .map((group) => {
            const label = getWeekLabel(group.key, group.label);
            return `<option value="${group.key}">${label}</option>`;
        })
        .join("");

    if (!currentWeekFilter || !groups.some((group) => group.key === currentWeekFilter)) {
        currentWeekFilter = groups[0].key;
    }

    weekFilter.value = currentWeekFilter;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return "Invalid date";
    }
    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

/**
 * Render workouts grouped by ISO week.
 */
function renderWorkouts() {
    const workouts = getWorkouts().filter(Boolean);
    refreshExerciseHistory(workouts);
    const grouped = groupWorkoutsByWeek(workouts);

    populateWeekFilter(grouped);

    if (!workouts.length) {
        listContainer.innerHTML = `<p class="placeholder">No workouts yet. Log your first session!</p>`;
        return;
    }

    if (!currentWeekFilter) {
        listContainer.innerHTML = `<p class="placeholder">Select a week to view its workouts.</p>`;
        return;
    }

    const activeGroup = grouped.find((group) => group.key === currentWeekFilter);

    if (!activeGroup) {
        listContainer.innerHTML = `<p class="placeholder">No workouts found for the selected week.</p>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    const heading = document.createElement("div");
    heading.className = "week-heading";
    heading.textContent = getWeekLabel(activeGroup.key, activeGroup.label);
    fragment.appendChild(heading);

    activeGroup.workouts
        .sort((a, b) => new Date(b.date) - new Date(a.date) || b.updatedAt - a.updatedAt)
        .forEach((workout) => {
            const card = document.createElement("article");
            card.className = "workout-card";

            const header = document.createElement("div");
            header.className = "workout-card-header";
            header.innerHTML = `
                <div>
                    <h3>${workout.name}</h3>
                    <p>${formatDate(workout.date)}</p>
                </div>
                <span class="muted-text">${workout.exercises.length} exercise${workout.exercises.length === 1 ? "" : "s"}</span>
            `;

            const exerciseList = document.createElement("ul");
            exerciseList.className = "exercise-list-display";
            workout.exercises.forEach((exercise) => {
                const item = document.createElement("li");
                item.textContent = `${exercise.name} - ${exercise.sets} sets x ${exercise.reps} reps @ ${exercise.weight} kg`;
                exerciseList.appendChild(item);
            });

            const notesPara = document.createElement("p");
            notesPara.className = "notes";
            notesPara.textContent = workout.notes ? workout.notes : "No notes added.";

            const actions = document.createElement("div");
            actions.className = "card-actions";
            actions.innerHTML = `
                <button type="button" class="secondary-btn" data-action="edit" data-id="${workout.id}">Edit</button>
                <button type="button" class="danger-btn" data-action="delete" data-id="${workout.id}">Delete</button>
            `;

            card.appendChild(header);
            card.appendChild(exerciseList);
            card.appendChild(notesPara);
            card.appendChild(actions);
            fragment.appendChild(card);
        });

    listContainer.innerHTML = "";
    listContainer.appendChild(fragment);
}

/**
 * Populate form for editing an existing workout.
 */
function handleEdit(id) {
    const workout = getWorkouts().find((item) => item && item.id === id);
    if (!workout) return;

    workoutIdInput.value = workout.id;
    workoutNameInput.value = workout.name;
    dateInput.value = workout.date;
    notesInput.value = workout.notes;
    exerciseBuffer = workout.exercises.map((exercise) => ({
        id: exercise.id || crypto.randomUUID(),
        name: exercise.name,
        sets: exercise.sets,
        reps: exercise.reps,
        weight: exercise.weight
    }));

    renderExerciseList();
    saveButton.textContent = "Update Workout";
    updateWeekDisplay();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Remove a workout entry by id.
 */
function handleDelete(id) {
    const filtered = getWorkouts().filter((item) => item && item.id !== id);
    setWorkouts(filtered);
    renderWorkouts();
}

form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!exerciseBuffer.length) {
        alert("Add at least one exercise to this workout.");
        return;
    }

    const workout = buildWorkoutFromForm();
    const workouts = getWorkouts();
    const index = workouts.findIndex((item) => item && item.id === workout.id);

    if (index >= 0) {
        workouts[index] = workout;
    } else {
        workouts.push(workout);
    }

    setWorkouts(workouts);
    resetForm();
    renderWorkouts();
});

exerciseSubmitBtn.addEventListener("click", addExerciseToBuffer);

exerciseListContainer.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const exerciseId = target.dataset.exerciseId;
    if (!exerciseId) return;
    const action = target.dataset.action || "remove";
    if (action === "remove") {
        removeExerciseFromBuffer(exerciseId);
    } else if (action === "edit") {
        beginExerciseEdit(exerciseId);
    } else if (action === "move-up") {
        moveExercise(exerciseId, -1);
    } else if (action === "move-down") {
        moveExercise(exerciseId, 1);
    }
});

resetBtn.addEventListener("click", resetForm);

clearStorageBtn.addEventListener("click", () => {
    if (!getWorkouts().length) return;
    const shouldClear = confirm("Delete all workouts? This cannot be undone.");
    if (shouldClear) {
        localStorage.removeItem(storageKey);
        currentWeekFilter = null;
        renderWorkouts();
    }
});

listContainer.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const action = target.dataset.action;
    const id = target.dataset.id;

    if (!action || !id) return;

    if (action === "edit") {
        handleEdit(id);
    }

    if (action === "delete") {
        const confirmed = confirm("Delete this workout?");
        if (confirmed) {
            handleDelete(id);
        }
    }
});

weekFilter.addEventListener("change", () => {
    currentWeekFilter = weekFilter.value;
    renderWorkouts();
});

dateInput.addEventListener("change", updateWeekDisplay);

if (weekLabelWrapper) {
    weekLabelWrapper.tabIndex = 0;
    weekLabelWrapper.addEventListener("click", (event) => {
        if (event.target === weekLabelInput) return;
        beginWeekLabelEdit();
    });
    weekLabelWrapper.addEventListener("keydown", (event) => {
        if (event.target !== weekLabelWrapper) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            beginWeekLabelEdit();
        }
    });
}

if (weekLabelInput) {
    weekLabelInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            finishWeekLabelEdit(true);
        } else if (event.key === "Escape") {
            event.preventDefault();
            finishWeekLabelEdit(false);
        }
    });
    weekLabelInput.addEventListener("blur", () => finishWeekLabelEdit(true));
}

if (exerciseNameInput) {
    exerciseNameInput.addEventListener("input", handleExerciseNameInput);
    exerciseNameInput.addEventListener("focus", () =>
        updateExerciseSuggestions(exerciseNameInput.value)
    );
}

if (exerciseSuggestions) {
    exerciseSuggestions.addEventListener("change", (event) => {
        const select = event.target;
        if (!(select instanceof HTMLSelectElement)) return;
        const encoded = select.value;
        if (!encoded) return;
        const name = decodeURIComponent(encoded);
        exerciseNameInput.value = name;
        handleExerciseNameInput();
        exerciseNameInput.focus();
        select.value = "";
    });
}

if (copyWorkoutBtn) {
    copyWorkoutBtn.addEventListener("click", copyPreviousWorkout);
}

if (themeToggle) {
    themeToggle.addEventListener("click", () => {
        const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
        applyTheme(nextTheme);
    });
}

// Initialize UI state.
initTheme();
loadWeekNames();
updateWeekDisplay();
renderExerciseList();
renderWorkouts();
