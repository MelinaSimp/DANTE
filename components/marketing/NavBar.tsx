import Image from "next/image";
import Link from "next/link";

export default function NavBar() {
  return (
    <nav className="flex items-center justify-between px-6 py-4 bg-beige">
      <Link href="/">
        <Image
          src="/brand/logo.png"  // Replace with your drift logo file (place in /public/brand/)
          alt="Drift Logo"
          width={120}
          height={40}
        />
      </Link>
      <div className="flex gap-6">
        <Link href="/features">Features</Link>
        <Link href="/resources">Resources</Link>
        <Link href="/auth">Sign in</Link>
      </div>
    </nav>
  );
}
