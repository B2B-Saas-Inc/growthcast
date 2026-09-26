import type { ReactEventHandler } from "react";
import { serviceNavigation } from "../serviceNavigation";

export default function ServicesNav({ onToggle }: { onToggle: ReactEventHandler<HTMLDetailsElement> }) {
  return (
    <details className="resourceNav servicesNav" onToggle={onToggle}>
      <summary>Services</summary>
      <div>
        <a href="/services">All services</a>
        {serviceNavigation.map((service) => (
          <a key={service.slug} href={`/services/${service.slug}`}>{service.name}</a>
        ))}
      </div>
    </details>
  );
}
