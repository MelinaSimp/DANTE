// find your onClick / handler and type properly, e.g.:
import { MouseEvent, useState } from "react";

function ProvisionNumberButton() {
  const [loading, setLoading] = useState(false);

  async function onClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      // … your fetch logic
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={onClick} disabled={loading} className="btn btn-primary">
      {loading ? "Provisioning…" : "Provision Number"}
    </button>
  );
}

export default ProvisionNumberButton;

