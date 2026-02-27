type HttpContext = {
  res?: any;
  log?: (...args: any[]) => void;
};

const handler = async (context: HttpContext, _req: any): Promise<void> => {
  context.res = {
    status: 200,
    headers: { "content-type": "application/json" },
    body: { status: "ok" }
  };
};

export = handler;
