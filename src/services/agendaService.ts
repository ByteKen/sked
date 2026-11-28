import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { sanitizeAgendaItems } from '@/domain/agenda';
import type { AgendaItem, AgendaItemDraft } from '@/types';

interface ApiErrorBody {
  error?: string;
}

export interface AgendaManageResponse {
  ok: true;
  item?: AgendaItem;
  items: AgendaItem[];
  warning?: string;
}

/**
 * Direct Firestore persistence for agenda edits that do not require scheduling or canceling
 * a Google Cloud Task (0 Vercel invocations, 0 Cloud Tasks ops, 1 Firestore write).
 */
export async function saveAgendaItemsInFirestore(
  uid: string,
  items: readonly AgendaItem[],
): Promise<void> {
  const userDocRef = doc(db, 'users', uid);
  await setDoc(
    userDocRef,
    {
      agendaItems: sanitizeAgendaItems(items),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

async function postAgendaManage(payload: Record<string, unknown>): Promise<AgendaManageResponse> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to manage agenda reminders.');
  }

  const idToken = await user.getIdToken();
  const response = await fetch('/api/agenda/manage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Agenda reminder API is unavailable in this environment.');
  }

  const data = (await response.json().catch(() => ({}))) as AgendaManageResponse & ApiErrorBody;
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Failed to schedule reminder (HTTP ${response.status})`);
  }

  return data;
}

export function upsertAgendaItemViaApi(item: AgendaItemDraft): Promise<AgendaManageResponse> {
  return postAgendaManage({ action: 'upsert', item });
}

export function toggleAgendaDoneViaApi(itemId: string): Promise<AgendaManageResponse> {
  return postAgendaManage({ action: 'toggle-done', itemId });
}

export function deleteAgendaItemViaApi(itemId: string): Promise<AgendaManageResponse> {
  return postAgendaManage({ action: 'delete', itemId });
}
