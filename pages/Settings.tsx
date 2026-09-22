import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    arrayRemove,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    serverTimestamp,
    setDoc,
    updateDoc,
} from "firebase/firestore";
import {
    ArrowLeft,
    Activity,
    AlertTriangle,
    Building,
    CheckSquare,
    ChevronLeft,
    ChevronRight,
    Download,
    Filter,
    Loader2,
    Plus,
    RefreshCw,
    Save,
    Search,
    Shield,
    Square,
    Trash2,
    Users,
    X,
} from "lucide-react";
import { db } from "../firebase";
import { getCurrentUserEmail } from "../services/cx";
import { ModeToggle } from "../components/ModeToggle";
import { AutoSyncToggle } from "../components/AutoSyncToggle";
import { getTargetCollection } from "../utils/appMode";
import { sanitizeForFirestore } from "../utils/firestore";
import { getNamePartsFromEmail } from "../utils/userNames";

type Role = "Master" | "Issuer" | "Receiver" | "Approver" | "Site Engineer";

interface UserAssignment {
    email?: string;
    role?: string;
    roles?: string | string[];
    firstName?: string;
    lastName?: string;
    phone?: string;
    [key: string]: unknown;
}

interface AppSettings {
    companyName: string;
    projectCode: string;
    roleAssignments: UserAssignment[];
}

interface NewUserForm {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    roles: Role[];
}

const PAGE_SIZE = 10;
const ROLE_OPTIONS: Role[] = [
    "Master",
    "Issuer",
    "Receiver",
    "Approver",
    "Site Engineer",
];
const DEFAULT_SETTINGS: AppSettings = {
    companyName: "Eastern Busway Alliance",
    projectCode: "EB-DEMO",
    roleAssignments: [
        { email: "dietrich.truchsess@easternbusway.nz", role: "Master" },
    ],
};

const EMPTY_NEW_USER: NewUserForm = {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    roles: [],
};

const getRoles = (user: UserAssignment): Role[] => {
    const values = Array.isArray(user.roles)
        ? user.roles
        : String(user.roles || user.role || "").split(",");
    return values
        .map((value) => String(value).trim())
        .filter((value): value is Role => ROLE_OPTIONS.includes(value as Role));
};

const getUserName = (user: UserAssignment) => {
    const fallback = getNamePartsFromEmail(user.email);
    return {
        firstName: user.firstName || fallback.firstName,
        lastName: user.lastName || fallback.lastName,
    };
};

export const Settings: React.FC = () => {
    const navigate = useNavigate();
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [failedPermits, setFailedPermits] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [newUserForm, setNewUserForm] = useState<NewUserForm>(EMPTY_NEW_USER);
    const [newUserError, setNewUserError] = useState("");
    const [userSearch, setUserSearch] = useState("");
    const [activeFilterMenu, setActiveFilterMenu] = useState<string | null>(null);
    const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({
        roles: [],
    });
    const [editingUserIndex, setEditingUserIndex] = useState<number | null>(null);
    const [editingUser, setEditingUser] = useState<UserAssignment | null>(null);
    const [editingOriginalEmail, setEditingOriginalEmail] = useState("");
    const [editingRoles, setEditingRoles] = useState<Role[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
    const retryTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    const currentUser = String(getCurrentUserEmail() || "").toLowerCase();
    const isMaster =
        currentUser.includes("dietrich") ||
        currentUser.includes("eba-dt");
    const filteredSortedUsers = settings.roleAssignments
        .map((user, index) => ({ user, index }))
        .filter(({ user }) => {
            const name = getUserName(user);
            const query = userSearch.trim().toLowerCase();
            return (
                !query ||
                `${name.firstName} ${name.lastName} ${user.email || ""}`
                    .toLowerCase()
                    .includes(query)
            );
        })
        .filter(
            ({ user }) =>
                columnFilters.roles.length === 0 ||
                columnFilters.roles.some((role) =>
                    getRoles(user).includes(role as Role),
                ),
        )
        .sort((a, b) => {
            const nameA = getUserName(a.user);
            const nameB = getUserName(b.user);
            return `${nameA.firstName} ${nameA.lastName}`.localeCompare(
                `${nameB.firstName} ${nameB.lastName}`,
            );
        });
    const totalPages = Math.max(
        1,
        Math.ceil(filteredSortedUsers.length / PAGE_SIZE),
    );
    const pageStart = (currentPage - 1) * PAGE_SIZE;
    const visibleUsers = filteredSortedUsers.slice(
        pageStart,
        pageStart + PAGE_SIZE,
    );

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const settingsRef = doc(db, "appSettings", "global");
                const snapshot = await getDoc(settingsRef);
                if (snapshot.exists()) {
                    const data = snapshot.data() as Partial<AppSettings>;
                    setSettings({
                        ...DEFAULT_SETTINGS,
                        ...data,
                        roleAssignments: Array.isArray(data.roleAssignments)
                            ? data.roleAssignments
                            : [],
                    });
                } else {
                    await setDoc(settingsRef, sanitizeForFirestore(DEFAULT_SETTINGS));
                }
            } catch (error) {
                console.error("Error loading settings:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadSettings();
        const unsubscribe = onSnapshot(
            collection(db, getTargetCollection()),
            (snapshot) => {
                const failedList: any[] = [];
                snapshot.forEach((item) => {
                    const data = item.data();
                    if (
                        data.sync_status === "failed" ||
                        data.syncStatus === "failed" ||
                        data.cxSyncError ||
                        data.sync_error
                    )
                        failedList.push({ id: item.id, ...data });
                });
                failedList.sort(
                    (a, b) =>
                        parseInt(String(b.itwocxNumber || "0").replace(/\D/g, "")) -
                        parseInt(String(a.itwocxNumber || "0").replace(/\D/g, "")),
                );
                setFailedPermits(failedList);
            },
        );

        return () => {
            unsubscribe();
            Object.values(retryTimers.current).forEach((timer) =>
                clearTimeout(timer),
            );
        };
    }, []);

    useEffect(() => {
        setCurrentPage((page) => Math.min(page, totalPages));
    }, [totalPages]);

    useEffect(() => {
        setCurrentPage(1);
    }, [userSearch, columnFilters]);

    const persistSettings = async (nextSettings: AppSettings) => {
        await setDoc(
            doc(db, "appSettings", "global"),
            sanitizeForFirestore(nextSettings),
        );
        setSettings(nextSettings);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await persistSettings(settings);
            alert("Global settings saved successfully.");
        } catch (error: any) {
            alert(`Error saving settings: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const closeAddUserModal = () => {
        setIsAddUserModalOpen(false);
        setNewUserForm(EMPTY_NEW_USER);
        setNewUserError("");
    };

    const toggleNewUserRole = (role: Role) => {
        setNewUserForm((previous) => ({
            ...previous,
            roles: previous.roles.includes(role)
                ? previous.roles.filter((item) => item !== role)
                : [...previous.roles, role],
        }));
    };

    const handleAddUser = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const firstName = newUserForm.firstName.trim();
        const lastName = newUserForm.lastName.trim();
        const email = newUserForm.email.trim().toLowerCase();
        const phone = newUserForm.phone.trim();

        if (!firstName || !lastName || !email || !phone || newUserForm.roles.length === 0) {
            setNewUserError("First name, last name, email, phone, and at least one role are required.");
            return;
        }
        if (!email.includes("@")) {
            setNewUserError("Please enter a valid email address.");
            return;
        }
        if (settings.roleAssignments.some((user) => String(user.email || "").toLowerCase() === email)) {
            setNewUserError("This user already has an assigned role.");
            return;
        }

        const nextSettings: AppSettings = {
            ...settings,
            roleAssignments: [
                ...settings.roleAssignments,
                { firstName, lastName, email, phone, roles: newUserForm.roles, role: newUserForm.roles[0] },
            ],
        };

        setIsSaving(true);
        try {
            await persistSettings(nextSettings);
            setCurrentPage(1);
            closeAddUserModal();
        } catch (error: any) {
            setNewUserError(`Error saving user: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const toggleFilterOption = (column: string, value: string) => {
        setColumnFilters((previous) => {
            const current = previous[column] || [];
            return {
                ...previous,
                [column]: current.includes(value)
                    ? current.filter((item) => item !== value)
                    : [...current, value],
            };
        });
    };

    const clearAllFilters = () => {
        setUserSearch("");
        setColumnFilters({ roles: [] });
        setActiveFilterMenu(null);
    };

    const handleRetrySync = async (permitId: string) => {
        if (retryingIds.has(permitId)) return;
        setRetryingIds((previous) => new Set(previous).add(permitId));
        try {
            await updateDoc(
                doc(db, getTargetCollection(), permitId),
                sanitizeForFirestore({
                    sync_status: "pending",
                    syncStatus: "pending",
                    updatedAt: serverTimestamp(),
                }),
            );
        } catch (error: any) {
            alert(`Error forcing retry: ${error.message}`);
        } finally {
            retryTimers.current[permitId] = setTimeout(() => {
                setRetryingIds((previous) => {
                    const next = new Set(previous);
                    next.delete(permitId);
                    return next;
                });
                delete retryTimers.current[permitId];
            }, 15000);
        }
    };

    const startEditingUser = (index: number) => {
        const user = settings.roleAssignments[index];
        if (!user) return;
        setEditingUserIndex(index);
        setEditingUser({ ...user });
        setEditingOriginalEmail(String(user.email || "").toLowerCase());
        setEditingRoles(getRoles(user));
    };

    const toggleEditingRole = (role: Role) => {
        setEditingRoles((previous) => {
            if (previous.includes(role))
                return previous.filter((item) => item !== role);
            const withoutOpposite =
                role === "Issuer"
                    ? previous.filter((item) => item !== "Receiver")
                    : role === "Receiver"
                        ? previous.filter((item) => item !== "Issuer")
                        : previous;
            return [...withoutOpposite, role];
        });
    };

    const handleSaveUser = async () => {
        if (
            editingUserIndex === null ||
            !editingUser ||
            !String(editingUser.email || "").trim()
        ) {
            alert("Please enter a valid email address.");
            return;
        }
        const normalizedEmail = String(editingUser.email).trim().toLowerCase();
        if (
            settings.roleAssignments.some(
                (user, index) =>
                    index !== editingUserIndex &&
                    String(user.email || "").toLowerCase() === normalizedEmail,
            )
        ) {
            alert("This email already has an assigned role.");
            return;
        }

        const updatedUser: UserAssignment = {
            ...editingUser,
            email: normalizedEmail,
            roles: editingRoles,
            role: editingRoles[0] || "",
        };
        const nextSettings = {
            ...settings,
            roleAssignments: settings.roleAssignments.map((user) =>
                String(user.email || "").toLowerCase() === editingOriginalEmail
                    ? updatedUser
                    : user,
            ),
        };
        setIsSaving(true);
        try {
            await persistSettings(nextSettings);
            setEditingUser(null);
            setEditingUserIndex(null);
            setEditingOriginalEmail("");
            setEditingRoles([]);
        } catch (error: any) {
            alert(`Error saving user: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveUser = async (user: UserAssignment, index: number) => {
        if (
            String(user.email || "")
                .toLowerCase()
                .includes("dietrich")
        ) {
            alert("Safety Lock: You cannot remove the primary Master account.");
            return;
        }
        try {
            await updateDoc(doc(db, "appSettings", "global"), {
                roleAssignments: arrayRemove(user),
            });
            setSettings((previous) => ({
                ...previous,
                roleAssignments: previous.roleAssignments.filter(
                    (item) => item !== user,
                ),
            }));
            if (editingUserIndex === index) {
                setEditingUser(null);
                setEditingUserIndex(null);
            }
        } catch (error: any) {
            alert(`Error deleting user: ${error.message}`);
        }
    };

    const handleGarbageCleanup = async () => {
        if (
            !window.confirm(
                "WARNING: This will permanently delete malformed and unsupported permits from the database. Proceed?",
            )
        )
            return;
        setIsLoading(true);
        try {
            const snapshot = await getDocs(collection(db, getTargetCollection()));
            for (const item of snapshot.docs) {
                const data = item.data();
                const permitType = String(data.permitType || "").toUpperCase();
                if (
                    !["BG", "PUMP", "EXCAVATION"].includes(permitType) ||
                    (data.status === "draft" && !data.partAChecklist)
                )
                    await deleteDoc(item.ref);
            }
            alert("Database cleanup complete.");
        } catch (error: any) {
            alert(`Error cleaning up: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading)
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="animate-spin text-blue-600 w-12 h-12" />
            </div>
        );

    return (
        <div className="min-h-screen bg-gray-50 p-6 animate-fade-in">
            <div className="max-w-5xl mx-auto">
                <div className="flex justify-between items-center mb-8 border-b-2 border-gray-200 pb-4">
                    <div>
                        <button
                            onClick={() => navigate("/")}
                            className="text-gray-500 font-bold flex items-center gap-1 mb-2 hover:text-gray-900"
                        >
                            <ArrowLeft size={16} /> Back to Dashboard
                        </button>
                        <h1 className="text-3xl font-black text-gray-900 uppercase flex items-center gap-3">
                            <Shield className="text-red-600" />{" "}
                            {isMaster ? "Master Settings" : "Settings"}
                        </h1>
                    </div>
                    {isMaster && (
                        <div className="flex gap-4">
                            <button
                                onClick={handleGarbageCleanup}
                                className="bg-red-100 hover:bg-red-200 text-red-700 px-6 py-3 rounded-xl font-black uppercase flex items-center gap-2 border border-red-200"
                            >
                                <Trash2 size={18} /> Clean Database
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-black uppercase flex items-center gap-2 shadow-lg"
                            >
                                {isSaving ? (
                                    <Loader2 size={18} className="animate-spin" />
                                ) : (
                                    <Save size={18} />
                                )}{" "}
                                Save Changes
                            </button>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-8">
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                                <Activity className="text-orange-500" /> System Dimension
                            </h2>
                            <p className="text-sm text-gray-500 max-w-md">
                                Toggle the entire application between LIVE and DEMO modes.
                            </p>
                        </div>
                        <div className="flex gap-4 flex-col sm:flex-row">
                            <ModeToggle />
                            {isMaster && <AutoSyncToggle />}
                        </div>
                    </div>

                    {isMaster && (
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-red-200">
                            <div className="flex items-center justify-between border-b pb-4 mb-6">
                                <h2 className="text-xl font-bold text-red-700 flex items-center gap-2">
                                    <AlertTriangle className="text-red-600" /> Sync Failures
                                </h2>
                                <span className="bg-red-100 text-red-800 text-xs font-black px-3 py-1 rounded-full uppercase">
                                    {failedPermits.length} Failed Permits
                                </span>
                            </div>
                            {failedPermits.length === 0 ? (
                                <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center text-green-700 font-bold">
                                    All permits are currently synced successfully.
                                </div>
                            ) : (
                                <div className="overflow-x-auto rounded-xl border border-gray-200">
                                    <table className="min-w-full text-sm text-left">
                                        <thead className="bg-gray-100 text-gray-600 uppercase font-black text-[10px] tracking-widest">
                                            <tr>
                                                <th className="p-4">Permit Reference</th>
                                                <th className="p-4">Type</th>
                                                <th className="p-4">Status</th>
                                                <th className="p-4">Sync Error Details</th>
                                                <th className="p-4 text-center">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {failedPermits.map((permit) => {
                                                const retrying = retryingIds.has(permit.id);
                                                return (
                                                    <tr key={permit.id}>
                                                        <td className="p-4 font-black">
                                                            {permit.itwocxNumber
                                                                ? `PF${String(permit.itwocxNumber).replace(/\D/g, "")}`
                                                                : permit.permitNumber || "N/A"}
                                                        </td>
                                                        <td className="p-4 uppercase">
                                                            {permit.permitType || "Permit"}
                                                        </td>
                                                        <td className="p-4">
                                                            {permit.sync_status ||
                                                                permit.syncStatus ||
                                                                "ERROR"}
                                                        </td>
                                                        <td className="p-4 text-xs text-red-600">
                                                            {permit.cxSyncError ||
                                                                permit.sync_error ||
                                                                "Unknown error"}
                                                        </td>
                                                        <td className="p-4 text-center">
                                                            <button
                                                                onClick={() => handleRetrySync(permit.id)}
                                                                disabled={retrying}
                                                                className="bg-orange-500 text-white px-3 py-2 rounded-lg font-bold text-xs"
                                                            >
                                                                {retrying ? (
                                                                    <Loader2 size={14} className="animate-spin" />
                                                                ) : (
                                                                    <RefreshCw size={14} />
                                                                )}
                                                            </button>
                                                            {permit.pdfBackupUrl && (
                                                                <button
                                                                    onClick={() =>
                                                                        window.open(permit.pdfBackupUrl, "_blank")
                                                                    }
                                                                    className="bg-red-600 text-white px-3 py-2 rounded-lg font-bold text-xs ml-2"
                                                                >
                                                                    <Download size={14} />
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {isMaster && (
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2 border-b pb-2">
                                <Building className="text-blue-600" /> General Platform Settings
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">
                                        Company / Project Name
                                    </label>
                                    <input
                                        type="text"
                                        value={settings.companyName}
                                        onChange={(event) =>
                                            setSettings({
                                                ...settings,
                                                companyName: event.target.value,
                                            })
                                        }
                                        className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">
                                        Default iTwoCX Project Code
                                    </label>
                                    <select
                                        value={settings.projectCode}
                                        onChange={(event) =>
                                            setSettings({
                                                ...settings,
                                                projectCode: event.target.value,
                                            })
                                        }
                                        className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 font-bold"
                                    >
                                        <option value="EB-DEMO">
                                            EB-DEMO (Testing / Training Environment)
                                        </option>
                                        <option value="EB">
                                            EB (LIVE / Production Environment)
                                        </option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {isMaster && (
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2 border-b pb-2">
                                <Users className="text-blue-600" /> Access Control List (ACL)
                            </h2>
                            <div className="flex flex-col sm:flex-row gap-3 mb-4">
                                <div className="relative flex-1">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input type="search" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search Users..." className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg" />
                                    {userSearch && <button onClick={() => setUserSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"><X size={14} /></button>}
                                </div>
                                <button onClick={clearAllFilters} className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-black text-red-700 bg-red-50 border border-red-200 hover:bg-red-100"><X size={16} /> Clear All Filters</button>
                            </div>
                            <div className="flex justify-end mb-8 bg-blue-50 p-4 rounded-xl border border-blue-100">
                                <button
                                    onClick={() => {
                                        setNewUserError("");
                                        setNewUserForm(EMPTY_NEW_USER);
                                        setIsAddUserModalOpen(true);
                                    }}
                                    className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold flex items-center justify-center gap-2"
                                >
                                    <Plus size={18} /> Add User
                                </button>
                            </div>
                            <div className="overflow-x-auto rounded-xl border border-gray-200">
                                <table className="min-w-full text-sm text-left">
                                    <thead className="bg-gray-100 text-gray-600 uppercase font-black text-[10px] tracking-widest">
                                        <tr>
                                            <th className="p-4">First Name</th>
                                            <th className="p-4">Last Name</th>
                                            <th className="p-4">Email</th>
                                            <th className="p-4">Phone</th>
                                            <th className="p-4 relative">
                                                <div className="flex items-center gap-2">Roles<button onClick={() => setActiveFilterMenu(activeFilterMenu === "roles" ? null : "roles")} className={`p-1 rounded ${columnFilters.roles.length > 0 ? "bg-blue-100 text-blue-700" : "text-gray-400 hover:bg-gray-200"}`}><Filter size={14} className={columnFilters.roles.length > 0 ? "fill-current" : ""} /></button></div>
                                                {activeFilterMenu === "roles" && <div className="absolute left-4 top-12 w-56 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 normal-case tracking-normal text-gray-900"><div className="p-2 border-b bg-gray-50 flex items-center justify-between text-xs font-bold"><span>Filter Roles</span><button onClick={() => setActiveFilterMenu(null)}><X size={14} /></button></div><div className="p-1">{ROLE_OPTIONS.map((role) => <label key={role} className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-blue-50 text-xs font-semibold">{columnFilters.roles.includes(role) ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} className="text-gray-300" />}{role}<input type="checkbox" className="hidden" checked={columnFilters.roles.includes(role)} onChange={() => toggleFilterOption("roles", role)} /></label>)}</div><div className="p-2 border-t"><button onClick={() => { setColumnFilters({ roles: [] }); setActiveFilterMenu(null); }} className="w-full py-1.5 text-xs font-bold text-gray-600 bg-gray-100 rounded">Clear Filter</button></div></div>}
                                            </th>
                                            <th className="p-4 text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {visibleUsers.map(({ user, index }) => {
                                            const name = getUserName(user);
                                            const roles = getRoles(user);
                                            return editingUserIndex === index && editingUser ? (
                                                <tr key={index} className="bg-blue-50">
                                                    <td className="p-2">
                                                        <input
                                                            value={editingUser.firstName || ""}
                                                            onChange={(event) =>
                                                                setEditingUser({
                                                                    ...editingUser,
                                                                    firstName: event.target.value,
                                                                })
                                                            }
                                                            className="w-full border rounded px-2 py-2"
                                                        />
                                                    </td>
                                                    <td className="p-2">
                                                        <input
                                                            value={editingUser.lastName || ""}
                                                            onChange={(event) =>
                                                                setEditingUser({
                                                                    ...editingUser,
                                                                    lastName: event.target.value,
                                                                })
                                                            }
                                                            className="w-full border rounded px-2 py-2"
                                                        />
                                                    </td>
                                                    <td className="p-2">
                                                        <input
                                                            type="email"
                                                            value={editingUser.email || ""}
                                                            onChange={(event) =>
                                                                setEditingUser({
                                                                    ...editingUser,
                                                                    email: event.target.value,
                                                                })
                                                            }
                                                            className="w-full border rounded px-2 py-2"
                                                        />
                                                    </td>
                                                    <td className="p-2">
                                                        <input
                                                            value={editingUser.phone || ""}
                                                            onChange={(event) =>
                                                                setEditingUser({
                                                                    ...editingUser,
                                                                    phone: event.target.value,
                                                                })
                                                            }
                                                            className="w-full border rounded px-2 py-2"
                                                        />
                                                    </td>
                                                    <td className="p-2">
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {ROLE_OPTIONS.map((role) => (
                                                                <label
                                                                    key={role}
                                                                    className="flex items-center gap-1 text-xs font-bold"
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={editingRoles.includes(role)}
                                                                        onChange={() => toggleEditingRole(role)}
                                                                    />
                                                                    {role}
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </td>
                                                    <td className="p-2 text-center whitespace-nowrap">
                                                        <button
                                                            onClick={handleSaveUser}
                                                            disabled={isSaving}
                                                            className="text-green-600 font-bold mr-3"
                                                        >
                                                            Save
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setEditingUser(null);
                                                                setEditingUserIndex(null);
                                                            }}
                                                            className="text-gray-500 font-bold"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </td>
                                                </tr>
                                            ) : (
                                                <tr key={index} className="hover:bg-gray-50">
                                                    <td className="p-4 font-bold">
                                                        {name.firstName || "N/A"}
                                                    </td>
                                                    <td className="p-4 font-bold">
                                                        {name.lastName || "N/A"}
                                                    </td>
                                                    <td className="p-4 font-bold">
                                                        {user.email || "N/A"}
                                                    </td>
                                                    <td className="p-4">{user.phone || "N/A"}</td>
                                                    <td className="p-4">
                                                        {roles.length ? roles.join(", ") : "N/A"}
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <button
                                                            onClick={() => startEditingUser(index)}
                                                            className="text-blue-600 font-bold mr-3"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            onClick={() => handleRemoveUser(user, index)}
                                                            className="text-red-500 p-2"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex items-center justify-between mt-4">
                                <button
                                    onClick={() =>
                                        setCurrentPage((page) => Math.max(1, page - 1))
                                    }
                                    disabled={currentPage === 1}
                                    className="flex items-center gap-1 px-3 py-2 border rounded-lg font-bold disabled:opacity-40"
                                >
                                    <ChevronLeft size={16} /> Previous
                                </button>
                                <span className="text-sm font-bold text-gray-600">
                                    Page {currentPage} of {totalPages}
                                </span>
                                <button
                                    onClick={() =>
                                        setCurrentPage((page) => Math.min(totalPages, page + 1))
                                    }
                                    disabled={currentPage === totalPages}
                                    className="flex items-center gap-1 px-3 py-2 border rounded-lg font-bold disabled:opacity-40"
                                >
                                    Next <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {isAddUserModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="add-user-title">
                    <form onSubmit={handleAddUser} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
                        <div className="flex items-start justify-between border-b border-gray-200 pb-4">
                            <div>
                                <h2 id="add-user-title" className="text-xl font-black text-gray-900">Add User</h2>
                                <p className="mt-1 text-sm text-gray-500">Register the user and assign at least one role.</p>
                            </div>
                            <button type="button" onClick={closeAddUserModal} disabled={isSaving} className="text-gray-400 hover:text-gray-700 disabled:opacity-40" aria-label="Close add user dialog"><X size={20} /></button>
                        </div>

                        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <label className="text-sm font-bold text-gray-700">First Name<input required value={newUserForm.firstName} onChange={(event) => setNewUserForm((previous) => ({ ...previous, firstName: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal" /></label>
                            <label className="text-sm font-bold text-gray-700">Last Name<input required value={newUserForm.lastName} onChange={(event) => setNewUserForm((previous) => ({ ...previous, lastName: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal" /></label>
                            <label className="text-sm font-bold text-gray-700 sm:col-span-2">Email Address<input required type="email" value={newUserForm.email} onChange={(event) => setNewUserForm((previous) => ({ ...previous, email: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal" /></label>
                            <label className="text-sm font-bold text-gray-700 sm:col-span-2">Phone Number<input required value={newUserForm.phone} onChange={(event) => setNewUserForm((previous) => ({ ...previous, phone: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal" /></label>
                        </div>

                        <fieldset className="mt-5">
                            <legend className="text-sm font-bold text-gray-700">Roles</legend>
                            <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-gray-200 p-3 sm:grid-cols-3">
                                {ROLE_OPTIONS.map((role) => <label key={role} className="flex items-center gap-2 text-sm font-semibold text-gray-700"><input type="checkbox" checked={newUserForm.roles.includes(role)} onChange={() => toggleNewUserRole(role)} />{role}</label>)}
                            </div>
                        </fieldset>

                        {newUserError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{newUserError}</p>}
                        <div className="mt-6 flex justify-end gap-3">
                            <button type="button" onClick={closeAddUserModal} disabled={isSaving} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-200 disabled:opacity-40">Cancel</button>
                            <button type="submit" disabled={isSaving} className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{isSaving && <Loader2 size={16} className="animate-spin" />} Save / Register</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};
