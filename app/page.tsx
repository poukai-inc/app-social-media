import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

// Homepage removed — `/` is the login entry point. Signed-in users go straight
// to the dashboard; everyone else lands on the LinkedIn sign-in page.
export default async function Home() {
  const session = await auth();
  redirect(session?.user ? '/dashboard' : '/login');
}
